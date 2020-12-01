const createError = require('http-errors');

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const mongoose = require('mongoose');
const indexRouter = require('./src/routes');
// const usersRouter = require('./routes/users');
const config = require('config')
const fs = require('fs')
const MapMultikeys = require('./src/MapMultikeys')
const {loadTimersUnlock} = require("./src/methods")

const app = express();

const {hostname, port} = config.get('Server')

const start = async () => {
    await mongoose.set('useFindAndModify', false)
    await mongoose.connect(config.get('MongoDB.url'), {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useCreateIndex: true
        },
        err => console.log('MONGOOSE:', err)
    )
    global.mapEventsHall = new Map()
    global.mapPlaces = new MapMultikeys()
    await loadTimersUnlock()
    const {isUse, codeToEventIdFile} = config.get('useFinExpert')
    if (isUse) {
        const readFile = () => {
            const codeToEventId = fs.readFileSync(codeToEventIdFile).toString()
            const arr = codeToEventId.split(/\r?\n/).map(value => value.split(/\t+| +|:|;|-/).map(value1 => Number.parseInt(value1)))
            // console.log({arr})
            const mapCodeToEventId = new Map(arr)
            const mapEventIdToCode = new Map(arr.map(value => value.reverse()))
            global.codeToEventId = code => mapCodeToEventId.get(code) || code
            global.eventIdToCode = eventId => mapEventIdToCode.get(eventId) || eventId
            console.log({mapCodeToEventId, mapEventIdToCode})
        }
        readFile()
        fs.watchFile(codeToEventIdFile, readFile)
    }
    //////////////////////////////
    // const compareObjects = (obj1, obj2, handlerCmpValues = (value1, value2) => value1 === value2) => {
    //     if (typeof obj1 === 'object') {
    //         if (typeof obj2 !== 'object')
    //             return false
    //         if (Array.isArray(obj1)) {
    //             if (!Array.isArray(obj2) || obj2.length !== obj1.length)
    //                 return false
    //             obj1 = obj1.sort()
    //             obj2 = obj2.sort()
    //         }
    //         const [keys1, keys2] = [obj1, obj2].map(obj => Object.keys(obj).sort())
    //         console.log({keys1, keys2})
    //         if (keys1.length !== keys2.length || JSON.stringify(keys1) !== JSON.stringify(keys2))
    //             return false
    //         for (let key of keys1) {
    //             if (!compareObjects(obj1[key], obj2[key], handlerCmpValues))
    //                 return false
    //         }
    //         return true
    //     }
    //     if (typeof obj2 === 'object')
    //         return false
    //     return handlerCmpValues(obj1, obj2)
    // }
    // const [obj1, obj2] = [
    //     {
    //         status: 0,
    //         sign: '71c9ad8275b08eab851933cacb8d686s',
    //         code: 80868,
    //         place: 1,
    //         row: 1,
    //         session: 'a997427dc8356026316dac039b841198',
    //         status_place: 1,
    //         status_update: 0
    //     },
    //     {
    //         status: false,
    //         sign: '71c9ad8275b08eab851933cacb8d686s',
    //         session: 'a997427dc8356026316dac039b841198',
    //         code: 80868,
    //         place: 1,
    //         row: 1,
    //         status_place: 1,
    //         status_update: false
    //     }
    // ]
    // console.log('compare:', compareObjects(obj1, obj2, (v1, v2) => {
    //     if (typeof v1 === 'boolean' || typeof v2 === 'boolean')
    //         return v1 == v2
    //     return v1 === v2
    // }))
    //////////////////////////////
    // view engine setup
// app.set('views', path.join(__dirname, 'views'));
// app.set('view engine', 'pug');

    app.use(logger('dev'));
    app.use(express.json());
    app.use(express.urlencoded({extended: false}));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'public')));

    app.use('/', indexRouter);
// app.use('/users', usersRouter);

// catch 404 and forward to error handler
    app.use(function (req, res, next) {
        next(createError(404));
    });

// error handler
    app.use(function (err, req, res, next) {
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
