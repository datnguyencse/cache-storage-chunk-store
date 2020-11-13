const queueMicrotask = require('queue-microtask')
const Buffer = require('buffer').Buffer

class Storage {
  constructor (chunkLength, opts) {
    if (!window || !window.caches) throw new Error('Not supported on this platform')

    if (!(this instanceof Storage)) return new Storage(chunkLength, opts)
    if (!opts) opts = {}

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

  put (index, buf, cb) {
    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    const isLastChunk = index === this.lastChunkIndex
    if (isLastChunk && buf.length !== this.lastChunkLength) {
      return nextTick(cb, new Error('Last chunk length must be ' + this.lastChunkLength))
    }

    if (!isLastChunk && buf.length !== this.chunkLength) {
      return nextTick(cb, new Error('Chunk length must be ' + this.chunkLength))
    }

    const stream = new window.ReadableStream({
      start (controller) {
        controller.enqueue(buf)
        controller.close()
      }
    })

    const response = new window.Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buf.length
      }
    })

    window.caches.open(this.name).then((cache) => {
      cache
        .put('/index/' + index, response)
        .then(() => callcb(cb, null))
    })
  }

  get (index, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = null
    }

    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    window.caches.open(this.name).then((cache) => {
      cache.match('/index/' + index).then((response) => {
        if (!response) {
          const err = new Error('Chunk not found')
          err.notFound = true
          return callcb(cb, err)
        }

        const isLastChunk = index === this.lastChunkIndex
        const bytes = new Uint8Array(isLastChunk ? this.lastChunkLength : this.chunkLength)

        const reader = response.body.getReader()

        let offset = 0
        reader.read().then(function readChunk ({ done, value }) {
          if (done) {
            const buf = Buffer.from(bytes)
            if (!opts) return callcb(cb, null, buf)
            const offset = opts.offset || 0
            const len = opts.length || buf.length - offset
            return callcb(cb, null, buf.slice(offset, len + offset))
          }

          bytes.set(value, offset)
          offset += value.length

          return reader.read().then(readChunk)
        }).catch((err) => callcb(cb, err))
      })
    })
  }

  close (cb) {
    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    this.closed = true

    nextTick(cb, null)
  }

  destroy (cb) {
    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    this.closed = true

    window.caches.open(this.name).then((cache) => {
      cache.keys().then((keys) => {
        keys.forEach((request) => {
          cache.delete(request)
        })

        callcb(cb, null)
      })
    })
  }
}

function nextTick (cb, err, val) {
  if (cb) queueMicrotask(() => cb(err, val))
}

function callcb (cb, err, val) {
  if (cb) cb(err, val)
}

module.exports = Storage
