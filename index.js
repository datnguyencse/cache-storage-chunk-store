const Buffer = require('buffer').Buffer

function noop () {}

class Storage {
  constructor (chunkLength, opts = {}) {
    if (!window || !window.caches) throw new Error('Not supported on this platform')

    if (!(this instanceof Storage)) return new Storage(chunkLength, opts)

    this.chunkLength = Number(chunkLength)
    if (!this.chunkLength) { throw new Error('First argument must be a chunk length') }

    this.closed = false
    this.length = Number(opts.length) || Infinity
    this.name = opts.name || 'CacheStorageChunkStore'
    if (this.length !== Infinity) {
      this.lastChunkLength = this.length % this.chunkLength || this.chunkLength
      this.lastChunkIndex = Math.ceil(this.length / this.chunkLength) - 1
    }
  }

  async init () {
    if (this.cache) return this.cache
    let lastHash = localStorage.getItem("last-player-hash")
    // delete last player item
    if (lastHash && lastHash != null && lastHash != this.name) {
      window.caches.open(lastHash).then((cache) => {
        cache.keys().then((keys) => {
          keys.forEach((request) => {
            cache.delete(request)
          })
        })
      })

      window.localStorage.setItem("last-player-hash", null)
    }

    this.cache = window.caches.open(this.name)
    window.localStorage.setItem("last-player-hash", this.name)
    return this.cache
  }

  put (index, buf, cb = noop) {
    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    const isLastChunk = index === this.lastChunkIndex
    if (isLastChunk && buf.length !== this.lastChunkLength) {
      return nextTick(cb, new Error('Last chunk length must be ' + this.lastChunkLength))
    }

    if (!isLastChunk && buf.length !== this.chunkLength) {
      return nextTick(cb, new Error('Chunk length must be ' + this.chunkLength))
    }

    const options = {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buf.length
      }
    }

    const response = new window.Response(buf, options)
    this.init().then((cache) => {
      cache
        .put('/index/' + index, response)
        .then(() => cb(null))
    })
  }

  get (index, opts, cb = noop) {
    if (typeof opts === 'function') {
      cb = opts
      opts = null
    }

    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    this.init().then((cache) => {
      cache.match('/index/' + index).then((response) => {
        if (!response) {
          return cb(new Error('Chunk not found'))
        }

        response.arrayBuffer().then(data => {
          if (!opts) return cb(null, Buffer.from(data))

          const offset = opts.offset || 0
          const len = opts.length || (buf.length - offset)
          return cb(null, Buffer.from(data).slice(offset, len + offset))
        }).catch(cb)
      }).catch(cb)
    })
  }

  close (cb = noop) {
    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    this.closed = true

    nextTick(cb, null)
  }

  destroy (cb = noop) {
    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    this.closed = true

    this.init().then((cache) => {
      cache.keys().then((keys) => {
        keys.forEach((request) => {
          cache.delete(request)
        })

        cb(null)
      })
    })
  }
}

function nextTick (cb, err, val) {
  queueMicrotask(() => cb(err, val))
}

module.exports = Storage
