const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('SpeedTest Tracker API is running');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
