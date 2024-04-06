const express = require('express');
const routes = require('./routes');

const app = express();

const PORT = process.env.PORT || 5000;

app.use(express.json());

app.use(routes);

app.use((req, res) => {
  res.status(404).send('Not Found');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
