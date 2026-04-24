import https from 'https'

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
const OSAMU_LINE_USER_ID = process.env.OSAMU_LINE_USER_ID

if (!LINE_CHANNEL_ACCESS_TOKEN) {
  throw new Error('LINE_CHANNEL_ACCESS_TOKEN environment variable is required')
}

if (!OSAMU_LINE_USER_ID) {
  throw new Error('OSAMU_LINE_USER_ID environment variable is required')
}

export async function notifyOsamu(message: string): Promise<void> {
  const payload = {
    to: OSAMU_LINE_USER_ID,
    messages: [
      {
        type: 'text',
        text: message,
      },
    ],
  }

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
      port: 443,
      path: '/v2/bot/message/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(JSON.stringify(payload)),
      },
    }

    const req = https.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          console.log('LINE notification sent successfully')
          resolve()
        } else {
          reject(new Error(`LINE API error: ${res.statusCode} ${data}`))
        }
      })
    })

    req.on('error', (err) => {
      reject(err)
    })

    req.write(JSON.stringify(payload))
    req.end()
  })
}
