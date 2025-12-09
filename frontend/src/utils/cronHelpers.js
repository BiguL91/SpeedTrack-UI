// Helper functions for Cron Logic

// Generiert den Cron-String aus Intervall und Startzeit
export const generateCron = (interval, timeStr) => {
    const [hh, mm] = timeStr.split(':').map(Number);
    
    if (interval === '5m') {
        // Alle 5 Min ab MM. 
        // Node-cron syntax für offset: "3-59/5 * * * *" startet bei Minute 3
        const startMin = mm % 5;
        return `${startMin}-59/5 * * * *`;
    }
    if (interval === '10m') {
        const startMin = mm % 10;
        return `${startMin}-59/10 * * * *`;
    }
    if (interval === '30m') {
        const startMin = mm % 30;
        return `${startMin}-59/30 * * * *`;
    }
    if (interval === '1h') {
        // Jede Stunde bei Minute mm
        return `${mm} * * * *`;
    }
    if (interval === '24h') {
        // Täglich um hh:mm
        return `${mm} ${hh} * * *`;
    }
    
    // Für X Stunden (2, 3, 4, 6, 12)
    // Wir müssen eine Liste von Stunden generieren, startend bei hh
    const hoursGap = parseInt(interval.replace('h', ''));
    if (!isNaN(hoursGap)) {
        let hours = [];
        // Finde den ersten Startpunkt am Tag (könnte gestern gewesen sein, aber wir nehmen hh als Anker)
        // Wir wollen: hh, hh+gap, hh+2gap... modulo 24.
        // Sortiert aufsteigend für Cron.
        
        let startHour = hh % hoursGap; // Normalisiert auf den Tag
        // Wenn User 14:00 wählt und alle 4h, dann: 2, 6, 10, 14, 18, 22.
        // Das ist besser als stur bei 14 anzufangen und 14, 18, 22, (morgen 02) zu machen.
        // Wir richten es am Tag aus, damit der Cron clean bleibt "2,6,10,14...".
        // ABER: Wenn User explizit 14:00 will, erwartet er vllt dass 14:00 der ERSTE ist.
        // Bei Cron "2,6,10,14" läuft er um 2 Uhr nachts auch. Das ist bei "Alle 4h" aber korrekt.
        // Nur "Täglich" ist einmalig.
        
        for (let h = startHour; h < 24; h += hoursGap) {
            hours.push(h);
        }
        return `${mm} ${hours.join(',')} * * *`;
    }

    return '0 * * * *'; // Fallback
};

// Liest den Cron-String und gibt Intervall und Zeit zurück
export const parseCronToState = (cronStr) => {
    try {
        const parts = cronStr.split(' ');
        const minPart = parts[0];
        const hourPart = parts[1];

        let parsedTime = '00:00';
        let parsedInterval = '1h';

        // Helper für Minute
        const getMin = (p) => {
            if (p.includes('-')) return parseInt(p.split('-')[0]); // "3-59/5" -> 3
            if (p.includes('/')) return 0; // "*/5" -> 0
            return parseInt(p); // "15" -> 15
        };
        
        const mm = getMin(minPart);
        const mmStr = mm.toString().padStart(2, '0');

        // Check Interval
        if (minPart.includes('/5')) { parsedInterval = '5m'; parsedTime = `00:${mmStr}`; }
        else if (minPart.includes('/10')) { parsedInterval = '10m'; parsedTime = `00:${mmStr}`; }
        else if (minPart.includes('/30')) { parsedInterval = '30m'; parsedTime = `00:${mmStr}`; }
        else if (hourPart === '*') {
            // Hourly: "15 * * * *"
            parsedInterval = '1h';
            parsedTime = `00:${mmStr}`; // Stunde egal bei stündlich, wir zeigen nur Min an eigentlich, aber User hat Input type=time
        }
        else if (hourPart.includes(',') || !isNaN(parseInt(hourPart))) {
            // Liste "2,6,10" oder Einzelwert "14"
            const hours = hourPart.split(',').map(Number);
            
            if (hours.length === 1) {
                // Täglich
                parsedInterval = '24h';
                parsedTime = `${hours[0].toString().padStart(2, '0')}:${mmStr}`;
            } else {
                // X Stunden
                // Abstand ermitteln
                const gap = hours.length > 1 ? (hours[1] - hours[0]) : 24;
                parsedInterval = `${gap}h`;
                
                // Als Startzeit nehmen wir die erste Stunde in der Liste, oder besser:
                // Wir versuchen die aktuelle Zeit zu matchen? Nein, einfach die erste der Liste.
                // Oder wir lassen den User 00:mm sehen.
                // Nehmen wir die erste Stunde der Liste.
                parsedTime = `${hours[0].toString().padStart(2, '0')}:${mmStr}`;
            }
        }
        
        return { interval: parsedInterval, time: parsedTime };

    } catch (e) {
        console.error("Fehler beim Parsen des Cron Strings für UI", e);
        // Fallbacks
        return { interval: '1h', time: '00:00' };
    }
};

export const getNextRunTime = (cronSchedule) => {
    if (!cronSchedule) return 'Lädt...';

    try {
        const parser = (str) => {
            // Sehr rudimentärer Parser für die Anzeige
            const now = new Date();
            let next = new Date(now);
            next.setMilliseconds(0);
            next.setSeconds(0);

            const parts = str.split(' ');
            const minStr = parts[0];
            const hourStr = parts[1];

            // 1. Minute bestimmen
            let addHour = false;
            
            // Logik für Minuten-Intervall
            if (minStr.includes('/')) {
                // z.B. 3-59/5 oder */5
                const offset = minStr.includes('-') ? parseInt(minStr.split('-')[0]) : 0;
                const step = parseInt(minStr.split('/')[1]);
                
                // Nächster Step finden
                let found = false;
                for (let m = offset; m < 60; m += step) {
                    if (m > now.getMinutes()) {
                        next.setMinutes(m);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    next.setMinutes(offset); // Nächste Stunde, erster Slot
                    addHour = true;
                }
            } else {
                // Feste Minute (z.B. "15")
                const fixedMin = parseInt(minStr);
                next.setMinutes(fixedMin);
                if (now.getMinutes() >= fixedMin) {
                    addHour = true;
                }
            }

            // 2. Stunde bestimmen
            if (hourStr === '*') {
                if (addHour) next.setHours(now.getHours() + 1);
            } else {
                // Feste Stunden oder Liste (2,6,10)
                const validHours = hourStr.split(',').map(Number).sort((a,b)=>a-b);
                
                let currentH = now.getHours();
                if (addHour) currentH++; // Wir sind schon über die Minute hinaus in dieser Stunde

                // Suche nächste valide Stunde
                let foundH = -1;
                for (let h of validHours) {
                    if (h >= currentH) {
                        foundH = h;
                        break;
                    }
                }

                if (foundH !== -1) {
                    next.setHours(foundH);
                    // Falls wir heute sind aber die Stunde "kleiner" ist als jetzt (passiert nicht durch loop)
                    // Falls wir durch addHour in den nächsten Tag rutschen würden (z.B. 23 Uhr -> 24 Uhr)
                    if (foundH < now.getHours()) {
                         next.setDate(now.getDate() + 1);
                    }
                } else {
                    // Keine Stunde mehr heute übrig -> Nimm erste Stunde morgen
                    next.setDate(now.getDate() + 1);
                    next.setHours(validHours[0]);
                }
            }
            
            return next;
        };

        const nextDate = parser(cronSchedule);
        
        // Formatierung
        const now = new Date();
        const isToday = nextDate.getDate() === now.getDate() && nextDate.getMonth() === now.getMonth();
        const isTomorrow = new Date(now.getTime() + 86400000).getDate() === nextDate.getDate();
        const timeStr = nextDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
        if (isToday) return `Heute, ${timeStr} Uhr`;
        if (isTomorrow) return `Morgen, ${timeStr} Uhr`;
        return `${nextDate.toLocaleDateString()} ${timeStr} Uhr`;

    } catch (err) {
      console.error("NextRun Parser Fehler:", err);
      return cronSchedule;
    }
};
