const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const mongoose = require('mongoose');
const indexRouter = require('./src/routes');
// const usersRouter = require('./routes/users');
const config = require('config')
const MapMultikeys = require('./src/MapMultikeys')

const app = express();

const {hostname, port} = config.get('Server')

const start = async () => {
  await mongoose.connect(config.get('MongoDB.url'), {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useCreateIndex: true
      },
      err => console.log('MONGOOSE:', err)
  )
  global.mapEventsHall = new Map()
  global.mapPlaces = new MapMultikeys()
  // view engine setup
// app.set('views', path.join(__dirname, 'views'));
// app.set('view engine', 'pug');
  /////////////////////////////
  // const arr = [{code: 0}, {code: 3}, {code: 5}]
  // console.log('reduce:', arr.reduce((acc, {code}) => {
  //   console.log({acc, code})
  //   return acc | code
  // }, 0))
  /////////////////////////////

  app.use(logger('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/', indexRouter);
// app.use('/users', usersRouter);

// catch 404 and forward to error handler
  app.use(function(req, res, next) {
    next(createError(404));
  });

// error handler
  app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
  });

  console.log(`listen ${hostname}:${port}`)
  app.listen(port, hostname)
}

start()

// module.exports = app;
