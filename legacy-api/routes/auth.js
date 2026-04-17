const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const authServiceDB = require('../services/authServiceDB');
const utilisateurDb = require('../services/utilisateurDb');
const { pool, getApiCredentials, saveApiCredentials } = require('../services/database');
const graphMailService = require('../services/graphMailService');
const SalesforceService = require('../services/salesforceService');
const wexService = require('../services/wexService');

void utilisateurDb;

function sanitizeString(str, maxLength = 100) {
  if (!str || typeof str !== 'string') return null;
  return str.trim().slice(0, maxLength).replace(/[<>"'`;]/g, '');
}

router.post('/auth/login', async (req, res) => {
  try {
    console.log('[API] POST /api/auth/login');
    const { email, password } = req.body;
    const result = await authServiceDB.login(email, password);
    
    // Toujours 200 pour éviter les erreurs "Failed to load resource" côté navigateur.
    // Le frontend se base sur `success` pour gérer l'auth.
    res.json(result);
  } catch (error) {
    console.error('[API] Erreur login:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/auth/logout', (req, res) => {
  try {
    console.log('[API] POST /api/auth/logout');
    const { sessionId } = req.body;
    const result = authServiceDB.logout(sessionId);
    res.json(result);
  } catch (error) {
    console.error('[API] Erreur logout:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/auth/session/:sessionId', (req, res) => {
  try {
    console.log('[API] GET /api/auth/session');
    const result = authServiceDB.verifierSession(req.params.sessionId);
    
    // Toujours 200 pour éviter les 401 visibles en console quand la session a expiré.
    res.json(result);
  } catch (error) {
    console.error('[API] Erreur vérification session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Liste utilisateurs (debug)
router.get('/auth/users', async (req, res) => {
  try {
    console.log('[API] GET /api/auth/users');
    res.json(await authServiceDB.getAllUtilisateurs());
  } catch (error) {
    console.error('[API] Erreur users:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/permissions/:utilisateurId', async (req, res) => {
  try {
    const perms = await authServiceDB.getPermissions(req.params.utilisateurId);
    res.json(perms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/permissions', async (req, res) => {
  try {
    const { utilisateurId, module, action, autorise } = req.body;
    await authServiceDB.setPermission(utilisateurId, module, action, autorise);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/admin/connexions', async (req, res) => {
  const results = {};

  // 1. PostgreSQL
  try {
    if (pool) {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      results.postgresql = {
        statut: 'connecté',
        message: 'Connexion PostgreSQL active',
        host: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'localhost'
      };
    } else {
      results.postgresql = { statut: 'non_configure', message: 'DATABASE_URL absent' };
    }
  } catch (e) {
    results.postgresql = { statut: 'erreur', message: e.message };
  }

  // 2. Salesforce Sandbox
  try {
    const configured = !!(process.env.SALESFORCE_SANDBOX_USERNAME && process.env.SALESFORCE_SANDBOX_PASSWORD);
    if (!configured) {
      results.salesforce_sandbox = {
        statut: 'non_configure',
        message: 'Credentials manquants',
        username: null,
        loginUrl: process.env.SALESFORCE_SANDBOX_LOGIN_URL || 'https://test.salesforce.com'
      };
    } else {
      const sf = new SalesforceService('sandbox');
      await sf.connect();
      results.salesforce_sandbox = {
        statut: 'connecté',
        message: 'Connexion Salesforce Sandbox active',
        username: process.env.SALESFORCE_SANDBOX_USERNAME,
        loginUrl: process.env.SALESFORCE_SANDBOX_LOGIN_URL || 'https://test.salesforce.com',
        hasToken: !!process.env.SALESFORCE_SANDBOX_SECURITY_TOKEN
      };
    }
  } catch (e) {
    results.salesforce_sandbox = {
      statut: 'erreur',
      message: e.message,
      username: process.env.SALESFORCE_SANDBOX_USERNAME || null,
      loginUrl: process.env.SALESFORCE_SANDBOX_LOGIN_URL || 'https://test.salesforce.com',
      hasToken: !!process.env.SALESFORCE_SANDBOX_SECURITY_TOKEN
    };
  }

  // 3. Salesforce Production
  try {
    const configured = !!(process.env.SALESFORCE_PROD_USERNAME && process.env.SALESFORCE_PROD_PASSWORD);
    if (!configured) {
      results.salesforce_prod = {
        statut: 'non_configure',
        message: 'Credentials manquants',
        username: null,
        loginUrl: process.env.SALESFORCE_PROD_LOGIN_URL || 'https://login.salesforce.com'
      };
    } else {
      const sf = new SalesforceService('production');
      await sf.connect();
      results.salesforce_prod = {
        statut: 'connecté',
        message: 'Connexion Salesforce Production active',
        username: process.env.SALESFORCE_PROD_USERNAME,
        loginUrl: process.env.SALESFORCE_PROD_LOGIN_URL || 'https://login.salesforce.com',
        hasToken: !!process.env.SALESFORCE_PROD_SECURITY_TOKEN
      };
    }
  } catch (e) {
    results.salesforce_prod = {
      statut: 'erreur',
      message: e.message,
      username: process.env.SALESFORCE_PROD_USERNAME || null,
      loginUrl: process.env.SALESFORCE_PROD_LOGIN_URL || 'https://login.salesforce.com',
      hasToken: !!process.env.SALESFORCE_PROD_SECURITY_TOKEN
    };
  }

  // 4. WEX
  try {
    const configured = !!(process.env.WEX_BASE_URL && process.env.WEX_CLIENT_ID && process.env.WEX_CLIENT_SECRET);
    if (!configured) {
      results.wex = {
        statut: 'non_configure',
        message: 'WEX_BASE_URL, WEX_CLIENT_ID ou WEX_CLIENT_SECRET manquants',
        baseUrl: process.env.WEX_BASE_URL || null,
        clientId: process.env.WEX_CLIENT_ID || null,
        accountNumber: process.env.WEX_ACCOUNT_NUMBER || null
      };
    } else {
      await wexService.getToken();
      const wexPath = path.join(__dirname, '..', '..', 'data/wex/transactions.json');
      const lastSync = fs.existsSync(wexPath) ? fs.statSync(wexPath).mtime : null;
      results.wex = {
        statut: 'connecté',
        message: 'Token WEX valide',
        baseUrl: process.env.WEX_BASE_URL,
        clientId: process.env.WEX_CLIENT_ID,
        accountNumber: process.env.WEX_ACCOUNT_NUMBER || null,
        lastSync: lastSync ? lastSync.toISOString() : null
      };
    }
  } catch (e) {
    results.wex = {
      statut: 'erreur',
      message: e.message,
      baseUrl: process.env.WEX_BASE_URL || null,
      clientId: process.env.WEX_CLIENT_ID || null,
      accountNumber: process.env.WEX_ACCOUNT_NUMBER || null
    };
  }

  // 5. Webfleet
  try {
    const configured = !!(process.env.WEBFLEET_ACCOUNT && process.env.WEBFLEET_USERNAME && process.env.WEBFLEET_API_KEY);
    if (!configured) {
      results.webfleet = {
        statut: 'non_configure',
        message: 'Credentials Webfleet manquants',
        account: process.env.WEBFLEET_ACCOUNT || null,
        username: process.env.WEBFLEET_USERNAME || null
      };
    } else {
      const testRes = await fetch(
        `https://csv.webfleet.com/extern?account=${process.env.WEBFLEET_ACCOUNT}&username=${process.env.WEBFLEET_USERNAME}&password=${process.env.WEBFLEET_PASSWORD}&apikey=${process.env.WEBFLEET_API_KEY}&lang=fr&action=showObjectReportExtern&outputformat=json`
      );
      const ok = testRes.ok || testRes.status === 200;
      results.webfleet = {
        statut: ok ? 'connecté' : 'erreur',
        message: ok ? 'Connexion Webfleet active' : `HTTP ${testRes.status}`,
        account: process.env.WEBFLEET_ACCOUNT,
        username: process.env.WEBFLEET_USERNAME,
        hasApiKey: !!process.env.WEBFLEET_API_KEY
      };
    }
  } catch (e) {
    results.webfleet = {
      statut: 'erreur',
      message: e.message,
      account: process.env.WEBFLEET_ACCOUNT || null,
      username: process.env.WEBFLEET_USERNAME || null,
      hasApiKey: !!process.env.WEBFLEET_API_KEY
    };
  }

  // 6. Microsoft Graph / SMTP
  try {
    const dbCreds = (await getApiCredentials('microsoft_graph')) || {};
    const tenantId = dbCreds.tenantId || process.env.MS_GRAPH_TENANT_ID;
    const clientId = dbCreds.clientId || process.env.MS_GRAPH_CLIENT_ID;
    const clientSecret = dbCreds.clientSecret || process.env.MS_GRAPH_CLIENT_SECRET;
    const fromEmail = dbCreds.fromEmail || process.env.MS_GRAPH_FROM_EMAIL;

    if (tenantId && clientId && clientSecret) {
      const result = await graphMailService.testConnection(tenantId, clientId, clientSecret);
      results.smtp = {
        ...result,
        type: 'Microsoft Graph',
        fromEmail,
        tenantId,
        clientId: clientId.length > 8 ? `${clientId.substring(0, 8)}...` : clientId
      };
    } else {
      const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
      if (!configured) {
        results.smtp = {
          statut: 'non_configure',
          message: 'Microsoft Graph (tenant/client/secret) ou SMTP_HOST, SMTP_USER et SMTP_PASS manquants',
          host: process.env.SMTP_HOST || null,
          user: process.env.SMTP_USER || null,
          port: process.env.SMTP_PORT || 587
        };
      } else {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT, 10) || 587,
          secure: parseInt(process.env.SMTP_PORT, 10) === 465,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
        await transporter.verify();
        results.smtp = {
          statut: 'connecté',
          message: 'Serveur SMTP accessible',
          type: 'SMTP',
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          user: process.env.SMTP_USER
        };
      }
    }
  } catch (e) {
    results.smtp = { statut: 'erreur', message: e.message };
  }

  res.json({
    timestamp: new Date().toISOString(),
    apis: results
  });
});

// GET - Récupérer les credentials d'une API depuis la DB
router.get('/admin/connexions/:apiName/credentials', async (req, res) => {
  try {
    const creds = await getApiCredentials(req.params.apiName);
    res.json(creds || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH - Sauvegarder les credentials d'une API en DB
router.patch('/admin/connexions/:apiName/credentials', async (req, res) => {
  try {
    const { apiName } = req.params;
    const validApis = [
      'salesforce_sandbox',
      'salesforce_prod',
      'wex',
      'webfleet',
      'smtp',
      'postgresql',
      'microsoft_graph'
    ];
    if (!validApis.includes(apiName)) {
      return res.status(400).json({ error: 'API non reconnue' });
    }
    await saveApiCredentials(apiName, req.body);
    res.json({ success: true, apiName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Tester la connexion avec les credentials fournis (sans sauvegarder)
router.post('/admin/connexions/:apiName/test', async (req, res) => {
  const { apiName } = req.params;
  const creds = req.body;

  try {
    let result = { statut: 'erreur', message: 'API non reconnue' };

    if (apiName === 'salesforce_sandbox' || apiName === 'salesforce_prod') {
      const env = apiName === 'salesforce_prod' ? 'production' : 'sandbox';
      const sf = new SalesforceService(env);
      // Override config avec les credentials fournis
      sf.getConfig = () => ({
        loginUrl:
          creds.loginUrl ||
          (env === 'production' ? 'https://login.salesforce.com' : 'https://test.salesforce.com'),
        username: creds.username,
        password: creds.password || '',
        securityToken: creds.securityToken || ''
      });
      await sf.connect();
      result = { statut: 'connecté', message: 'Connexion Salesforce réussie' };
    } else if (apiName === 'wex') {
      if (!creds.baseUrl || !creds.clientId || !creds.clientSecret) {
        result = { statut: 'erreur', message: 'baseUrl, clientId et clientSecret requis' };
      } else {
        const testRes = await fetch(`${creds.baseUrl}/auth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            username: creds.username || '',
            password: creds.password || ''
          })
        });
        if (testRes.ok) {
          result = { statut: 'connecté', message: 'Token WEX obtenu avec succès' };
        } else {
          result = {
            statut: 'erreur',
            message: `HTTP ${testRes.status} — Vérifiez vos credentials WEX`
          };
        }
      }
    } else if (apiName === 'webfleet') {
      const testRes = await fetch(
        `https://csv.webfleet.com/extern?account=${creds.account}&username=${creds.username}&password=${creds.password || ''}&apikey=${creds.apiKey}&lang=fr&action=showObjectReportExtern&outputformat=json`
      );
      result = testRes.ok
        ? { statut: 'connecté', message: 'Connexion Webfleet réussie' }
        : { statut: 'erreur', message: `HTTP ${testRes.status}` };
    } else if (apiName === 'smtp') {
      const tenantId = creds.tenantId;
      const clientId = creds.clientId;
      const clientSecret = creds.clientSecret;
      if (tenantId && clientId && clientSecret) {
        result = await graphMailService.testConnection(tenantId, clientId, clientSecret);
      } else {
        const transporter = nodemailer.createTransport({
          host: creds.host,
          port: parseInt(creds.port, 10) || 587,
          secure: parseInt(creds.port, 10) === 465,
          auth: { user: creds.user, pass: creds.password }
        });
        await transporter.verify();
        result = { statut: 'connecté', message: 'Serveur SMTP accessible' };
      }
    } else if (apiName === 'microsoft_graph') {
      const { tenantId, clientId, clientSecret } = creds;
      if (!tenantId || !clientId || !clientSecret) {
        result = { statut: 'erreur', message: 'tenantId, clientId et clientSecret requis' };
      } else {
        result = await graphMailService.testConnection(tenantId, clientId, clientSecret);
      }
    } else if (apiName === 'postgresql') {
      const { Pool } = require('pg');
      const testPool = new Pool({ connectionString: creds.connectionString });
      try {
        const client = await testPool.connect();
        try {
          await client.query('SELECT 1');
        } finally {
          client.release();
        }
        result = { statut: 'connecté', message: 'Connexion PostgreSQL réussie' };
      } finally {
        await testPool.end();
      }
    }

    res.json(result);
  } catch (error) {
    res.status(200).json({ statut: 'erreur', message: error.message });
  }
});

// POST - Tester l'envoi d'un email via Microsoft Graph
router.post('/admin/mail/test', async (req, res) => {
  try {
    const { to, tenantId, clientId, clientSecret, fromEmail } = req.body;

    const dbCreds = (await getApiCredentials('microsoft_graph')) || {};
    const creds = {
      tenantId: tenantId || dbCreds.tenantId || process.env.MS_GRAPH_TENANT_ID,
      clientId: clientId || dbCreds.clientId || process.env.MS_GRAPH_CLIENT_ID,
      clientSecret: clientSecret || dbCreds.clientSecret || process.env.MS_GRAPH_CLIENT_SECRET,
      fromEmail: fromEmail || dbCreds.fromEmail || process.env.MS_GRAPH_FROM_EMAIL
    };

    if (!creds.tenantId || !creds.clientId || !creds.clientSecret) {
      return res.status(400).json({ error: 'Credentials Microsoft Graph manquants' });
    }

    await graphMailService.sendMail({
      ...creds,
      to: to || creds.fromEmail,
      subject: '✅ Test email G2L Dashboard',
      body: `
        <div style="font-family: DM Sans, sans-serif; padding: 20px;">
          <h2 style="color: #2563EB;">G2L Dashboard — Test email</h2>
          <p>Cet email confirme que la connexion Microsoft Graph est opérationnelle.</p>
          <p style="color: #6B7280; font-size: 12px;">Envoyé le ${new Date().toLocaleString('fr-FR')}</p>
        </div>
      `
    });

    res.json({ success: true, message: `Email envoyé à ${to || creds.fromEmail}` });
  } catch (error) {
    console.error('[Graph Mail] Erreur test:', error);
    res.status(500).json({ error: error.message });
  }
});

// Routes API pour gestion utilisateurs
router.get('/utilisateurs', async (req, res) => {
  try {
    const users = await authServiceDB.getAllUtilisateurs();
    res.json(users);
  } catch (error) {
    console.error('[API] Erreur getAllUtilisateurs:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/utilisateurs/stats', async (req, res) => {
  try {
    const stats = await authServiceDB.getStatistiquesUtilisateurs();
    res.json(stats);
  } catch (error) {
    console.error('[API] Erreur stats utilisateurs:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/utilisateurs/:id', async (req, res) => {
  try {
    const user = await authServiceDB.getUtilisateurById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    res.json(user);
  } catch (error) {
    console.error('[API] Erreur getUtilisateurById:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/utilisateurs', async (req, res) => {
  try {
    const newUser = await authServiceDB.createUtilisateur(req.body);
    res.status(201).json(newUser);
  } catch (error) {
    console.error('[API] Erreur createUtilisateur:', error);
    res.status(400).json({ error: error.message });
  }
});

router.put('/utilisateurs/:id', async (req, res) => {
  try {
    const updatedUser = await authServiceDB.updateUtilisateur(req.params.id, req.body);
    res.json(updatedUser);
  } catch (error) {
    console.error('[API] Erreur updateUtilisateur:', error);
    res.status(400).json({ error: error.message });
  }
});

router.delete('/utilisateurs/:id', async (req, res) => {
  try {
    await authServiceDB.deleteUtilisateur(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Erreur deleteUtilisateur:', error);
    res.status(400).json({ error: error.message });
  }
});

router.patch('/utilisateurs/:id/toggle-actif', async (req, res) => {
  try {
    const updatedUser = await authServiceDB.toggleUtilisateurActif(req.params.id);
    res.json(updatedUser);
  } catch (error) {
    console.error('[API] Erreur toggleUtilisateurActif:', error);
    res.status(400).json({ error: error.message });
  }
});

router.get('/roles', (req, res) => {
  try {
    const roles = authServiceDB.getRoles();
    res.json(roles);
  } catch (error) {
    console.error('[API] Erreur getRoles:', error);
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
