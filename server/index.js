require('dotenv').config();
const { createApp } = require('./app');

const PORT = Number(process.env.PORT || 5088);
const app = createApp();

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
