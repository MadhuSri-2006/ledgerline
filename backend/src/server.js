const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`LedgerLine API running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
