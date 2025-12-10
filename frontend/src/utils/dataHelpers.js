// Hilfsfunktion: Prüft, ob ein Testergebnis unter dem erwarteten Grenzwert liegt
export const isBelowThreshold = (test, expectedDownload, expectedUpload, tolerance) => {
    const eDown = parseFloat(expectedDownload);
    const eUp = parseFloat(expectedUpload);
    const tol = parseFloat(tolerance);
    
    if (eDown > 0 && test.download < eDown * (1 - tol / 100)) return true;
    if (eUp > 0 && test.upload < eUp * (1 - tol / 100)) return true;
    return false;
};

// Helper um Server Location sauber anzuzeigen (ohne ID im Text) und zu formatieren
export const formatServerDisplay = (test) => {
    let displayLocation = test.serverLocation || '';
    let displayId = test.serverId;

    // Für alte manuelle Tests, bei denen die ID noch im Location-String steckt:
    // Versuche, die ID aus dem Location-String zu extrahieren, wenn test.serverId fehlt
    if (!displayId && displayLocation) {
        const embeddedIdMatch = displayLocation.match(/\(id\s*[=:]\s*(\d+)\)/i);
        if (embeddedIdMatch && embeddedIdMatch[1]) {
            displayId = embeddedIdMatch[1];
        }
    }

    // Entferne immer die (id=...) oder (ID=...) Teile aus dem Location-String für eine saubere Anzeige
    displayLocation = displayLocation.replace(/\s*\(id\s*[=:]\s*\d+\)/gi, '').trim();

    let formattedString = displayLocation;
    if (displayId) {
        formattedString += ` (ID: ${displayId})`;
    }
    return formattedString;
};
