const _ = require('lodash')
const { default: axios } = require("axios");

/* global WIKI */

// ------------------------------------
// Azure AD Account
// ------------------------------------

const OIDCStrategy = require('passport-azure-ad').OIDCStrategy

module.exports = {
  init (passport, conf) {
    // Workaround for Chrome's SameSite cookies
    // cookieSameSite needs useCookieInsteadOfSession to work correctly.
    // cookieEncryptionKeys is extracted from conf.cookieEncryptionKeyString.
    // It's a concatnation of 44-character length strings each of which represents a single pair of key/iv.
    // Valid cookieEncryptionKeys enables both cookieSameSite and useCookieInsteadOfSession.
    const keyArray = [];
    if (conf.cookieEncryptionKeyString) {
      let keyString = conf.cookieEncryptionKeyString;
      while (keyString.length >= 44) {
        keyArray.push({ key: keyString.substring(0, 32), iv: keyString.substring(32, 44) });
        keyString = keyString.substring(44);
      }
    }
    passport.use(conf.key,
      new OIDCStrategy({
        identityMetadata: conf.entryPoint,
        clientID: conf.clientId,
        redirectUrl: conf.callbackURL,
        responseType: 'id_token code',
        responseMode: 'form_post',
        scope: ['profile', 'email', 'openid'],
        allowHttpForRedirectUrl: WIKI.IS_DEBUG,
        clientSecret: conf.clientSecretValueString,
        passReqToCallback: true,
        cookieSameSite: keyArray.length > 0,
        useCookieInsteadOfSession: keyArray.length > 0,
        cookieEncryptionKeys: keyArray
      }, async (req, iss, sub, profile, access_token, refresh_token, cb) => {
        const usrEmail = _.get(profile, '_json.email', null) || _.get(profile, '_json.preferred_username')
        try {
          const fullProfile = await callAPI(
            "https://graph.microsoft.com/beta/me",
            access_token
          );

          const user = await WIKI.models.users.processProfile({
            providerKey: req.params.strategy,
            profile: {
              id: profile.oid,
              displayName: profile.displayName,
              email: usrEmail,
              jobTitle: fullProfile.jobTitle,
              location: fullProfile.department,
              picture: ''
            }
          })
          cb(null, user)
        } catch (err) {
          cb(err, null)
        }
      })
    );

    async function callAPI(endpoint, accessToken) {
      if (!accessToken || accessToken === "") {
        throw new Error("No tokens found");
      }

      const options = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };

      try {
        const response = await axios.default.get(endpoint, options);
        return response.data;
      } catch (error) {
        console.log(error);
        return error;
      }
    }
  }
}
