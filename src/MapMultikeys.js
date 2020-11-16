class MapMultikeys {
    constructor() {
        const map = new Map()
        this.set = (keys, value) => {
            if (!Array.isArray(keys))
                return
            let obj = map
            keys.forEach((key, i) => {
                if (i < keys.length - 1) {
                    let nestedObj = obj.get(key)
                    if (!(nestedObj instanceof Map)) {
                        // if (typeof nestedObj === 'object')
                        //     delete nestedObj
                        nestedObj = new Map()
                        obj.set(key, nestedObj)
                    }
                    obj = nestedObj
                } else {
                    obj.set(key, value)
                }
            })
            // console.log({map})
        }
        this.get = keys => {
            if (!Array.isArray(keys))
                return undefined
            let obj = map
            for (let i = 0; i < keys.length; ++i) {
                let nestedObj = obj.get(keys[i])
                if (i < keys.length - 1) {
                    if (!(nestedObj instanceof Map))
                        return undefined
                    else
                        obj = nestedObj
                } else
                    return nestedObj
            }
        }
    }
}

module.exports = MapMultikeys