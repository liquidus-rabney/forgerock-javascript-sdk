/*
 * @forgerock/javascript-sdk
 *
 * autoscript.ts
 *
 * Copyright (c) 2020 ForgeRock. All rights reserved.
 * This software may be modified and distributed under the terms
 * of the MIT license. See the LICENSE file for details.
 */

(function () {
  const rxMergeMap = rxjs.operators.mergeMap;
  const rxMap = rxjs.operators.map;
  const rxTap = rxjs.operators.tap;

  const delay = 0;

  const url = new URL(window.location.href);
  const amUrl = url.searchParams.get('amUrl') || 'https://auth.example.com:9443/am';
  const clientId = url.searchParams.get('clientId') || 'WebOAuthClient';
  const pw = url.searchParams.get('pw') || 'password';
  const realmPath = url.searchParams.get('realmPath') || 'middleware';
  const scope = url.searchParams.get('scope') || 'openid profile me.read';
  const setMiddleware = url.searchParams.get('middleware') || 'atConfig';
  const tree = url.searchParams.get('tree') || 'UsernamePassword';
  const un = url.searchParams.get('un') || 'sdkuser';

  const middleware = [
    (req, action, next) => {
      switch (action.type) {
        case 'START_AUTHENTICATE':
          req.url.searchParams.set('start-authenticate-middleware', 'start-authentication');
          req.init.headers.append('x-start-authenticate-middleware', 'start-authentication');
          break;
        case 'AUTHENTICATE':
          req.url.searchParams.set('authenticate-middleware', 'authentication');
          req.init.headers.append('x-authenticate-middleware', 'authentication');
          break;
        case 'AUTHORIZE':
          req.url.searchParams.set('authorize-middleware', 'authorization');
          break;
        case 'EXCHANGE_TOKEN':
          req.url.searchParams.set('exchange-token-middleware', 'exchange-token');
          req.init.headers.append('x-exchange-token-middleware', 'exchange-token');
          break;
        case 'USER_INFO':
          req.url.searchParams.set('userinfo-middleware', 'userinfo');
          req.init.headers.append('x-userinfo-middleware', 'userinfo');
          break;
      }
      next();
    },
    (req, action, next) => {
      switch (action.type) {
        case 'LOGOUT':
          req.url.searchParams.set('logout-middleware', 'logout');
          req.init.headers.append('x-logout-middleware', 'logout');
          break;
        case 'REVOKE_TOKEN':
          req.url.searchParams.set('revoke-token-middleware', 'revoke-token');
          req.init.headers.append('x-revoke-token-middleware', 'revoke-token');
          break;
        case 'END_SESSION':
          req.url.searchParams.set('end-session-middleware', 'end-session');
          req.init.headers.append('x-end-session-middleware', 'end-session');
          break;
      }
      next();
    },
  ];

  console.log('Configure the SDK');
  forgerock.Config.set({
    clientId,
    middleware: setMiddleware === 'atConfig' ? middleware : null,
    redirectUri: `${url.origin}/_callback/`,
    realmPath,
    scope,
    serverConfig: {
      baseUrl: amUrl,
    },
    tree,
  });

  try {
    forgerock.SessionManager.logout(setMiddleware === 'atCallSite' ? { middleware } : null);
  } catch (err) {
    // Do nothing
  }

  console.log('Initiate first step with `undefined`');
  rxjs
    .from(forgerock.FRAuth.next(null, setMiddleware === 'atCallSite' ? { middleware } : null))
    .pipe(
      rxMergeMap((step) => {
        console.log('Set values on auth tree callbacks');
        step.getCallbackOfType('NameCallback').setName(un);
        step.getCallbackOfType('PasswordCallback').setPassword(pw);
        return forgerock.FRAuth.next(step, setMiddleware === 'atCallSite' ? { middleware } : null);
      }),
      rxjs.operators.delay(delay),
      rxMergeMap((step) => {
        if (step.payload.status === 401) {
          throw new Error('Auth_Error');
        } else if (step.payload.status === 406) {
          throw new Error('Middleware_Error');
        } else if (step.payload.tokenId) {
          console.log('Auth tree successfully completed');
          console.log('Get OAuth tokens');
          const tokens = forgerock.TokenManager.getTokens(
            setMiddleware === 'atCallSite' ? { middleware } : null,
          );
          return tokens;
        } else {
          throw new Error('Something went wrong');
        }
      }),
      rxMap((tokens) => {
        if (tokens.accessToken) {
          console.log('OAuth login successful');
          document.body.innerHTML = '<p class="Logged_In">Login successful</p>';
        } else {
          throw new Error('Session_Error');
        }
        return tokens;
      }),
      rxjs.operators.delay(delay),
      rxMergeMap((tokens) => {
        console.log('Get user info from OAuth endpoint');
        const user = forgerock.UserManager.getCurrentUser(
          setMiddleware === 'atCallSite' ? { middleware } : null,
        );
        return user;
      }),
      rxjs.operators.delay(delay),
      rxMergeMap((user) => {
        if (user) {
          console.log('User info successfully responded');
          return forgerock.FRUser.logout(setMiddleware === 'atCallSite' ? { middleware } : null);
        } else {
          throw new Error('Userinfo_Error');
        }
      }),
      rxjs.operators.delay(delay),
      rxMergeMap(
        (step) => {
          return forgerock.TokenStorage.get();
        },
        (step, tokens) => {
          if (!tokens) {
            console.log('Logout successful');
            document.body.innerHTML = '<p class="Logged_Out">Logout successful</p>';
          } else {
            throw new Error('Logout_Error');
          }
          return step;
        },
      ),
      rxTap(
        () => {},
        (err) => {
          console.log(`Error: ${err.message}`);
          document.body.innerHTML = `<p class="Test_Failure">${err.message}</p>`;
        },
        () => {},
      ),
    )
    .subscribe(
      (data) => {},
      (err) => {},
      () => {
        console.log('Test script complete');
        document.body.innerHTML = `<p class="Test_Complete">Test script complete</p>`;
      },
    );
})();
