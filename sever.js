const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();
const HttpError = require('./models/http-error.model');


const userRoute = require('./routes/user.route');
const unitRoute = require('./routes/unit.route');
const productRoute = require('./routes/product.route');
const importRoute = require('./routes/import.route');
const inventoryRoute = require('./routes/inventory.route');
const exportRoute = require('./routes/export.route');

const app = express();
const PORT = process.env.PORT ;
const MONGO_URI = process.env.db;

app.use(bodyParser.json());
app.use('/uploads/images', express.static(path.join('uploads', 'images')));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');

  next();
});

app.use('/api/user', userRoute);
app.use('/api/unit', unitRoute);
app.use('/api/product', productRoute);
app.use('/api/import', importRoute);
app.use('/api/inventory', inventoryRoute);
app.use('/api/export', exportRoute);

app.get('/', (req, res) => {
  res.json({ message: 'Server is running' });
});

app.use((req, res, next) => {
  return next(new HttpError('Could not find this route.', 404));
});

app.use((error, req, res, next) => {
  if (req.file) {
    fs.unlink(req.file.path, err => {
      if (err) {
        console.log(err);
      }
    });
  }

  if (res.headerSent) {
    return next(error);
  }

  res.status(error.code || 500);
  res.json({ message: error.message || 'An unknown error occurred!' });
});

if (!MONGO_URI) {
  console.log('MongoDB connection error: Missing "db" value in .env');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.log('MongoDB connection error:', err.message);
  });

mongoose.connection.on('connected', () => {
  console.log('Connected to DB:', mongoose.connection.name);
});
