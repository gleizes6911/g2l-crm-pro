const { ConfidentialClientApplication } = require('@azure/msal-node')

/** Repli si fetch natif absent (ex. Node < 18). */
const fetch =
  typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : require('node-fetch')

let msalClient = null

function getMsalClient(tenantId, clientId, clientSecret) {
  msalClient = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  })
  return msalClient
}

async function getAccessToken(tenantId, clientId, clientSecret) {
  const client = getMsalClient(tenantId, clientId, clientSecret)
  const result = await client.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  })
  return result.accessToken
}

async function sendMail({ tenantId, clientId, clientSecret, fromEmail, to, subject, body, attachments = [] }) {
  const token = await getAccessToken(tenantId, clientId, clientSecret)

  const message = {
    subject,
    body: {
      contentType: 'HTML',
      content: body,
    },
    toRecipients: Array.isArray(to)
      ? to.map((email) => ({ emailAddress: { address: email } }))
      : [{ emailAddress: { address: to } }],
    attachments: attachments.map((att) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: att.filename,
      contentType: att.contentType || 'application/octet-stream',
      contentBytes: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content,
    })),
  }

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Graph API error ${response.status}: ${error}`)
  }

  return { success: true }
}

async function testConnection(tenantId, clientId, clientSecret) {
  try {
    await getAccessToken(tenantId, clientId, clientSecret)
    return { statut: 'connecté', message: 'Token Microsoft Graph obtenu avec succès' }
  } catch (e) {
    return { statut: 'erreur', message: e.message }
  }
}

module.exports = { sendMail, testConnection, getAccessToken }
