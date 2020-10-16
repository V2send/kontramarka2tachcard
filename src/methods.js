const fetch = require('node-fetch')
const config = require('config')

const {url} = config.get('Kontramarka')

const takeallshedules = async user => {
    const result = await fetch(
        `${url}/shows/?sessionid=${user.sessionid}`,
        {
            method: 'GET',
            headers: {'Content-Type': 'application/json'}
        }
    )
        .then(res => res.json())
    console.log({result})
}

module.exports = {takeallshedules}