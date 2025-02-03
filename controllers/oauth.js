import { prisma } from "../utils/global.js";
import logger from '../utils/logger.js';
import configManager from "../utils/configManager.js";
import crypto from 'crypto';

// OAuth 提供商配置
export const OAUTH_PROVIDERS = {
  google: {
    id: 'google',
    name: 'Google',
    type: 'oauth_google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    clientId: '709780297629-3neesubncsvauo7egmmn3i94fsupj24p.apps.googleusercontent.com',
    clientSecret: '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',
    redirectUri: 'http://zero.cat:3000/account/oauth/google/callback'
  },
  microsoft: {
    id: 'microsoft',
    name: 'Microsoft',
    type: 'oauth_microsoft',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scope: 'openid email profile User.Read',
    clientId: '2f98a6b0-9845-4544-8901-a6c7c7e2e2f0',
    clientSecret: 'Aqr8Q~LXmJ5~PZN9X8KqXJ2JZYzQKvRzEFkTNcqH',
    redirectUri: 'http://zero.cat:3000/account/oauth/microsoft/callback'
  },
  github: {
    id: 'github',
    name: 'GitHub',
    type: 'oauth_github',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scope: 'read:user user:email',
    clientId: '1234567890abcdef1234',
    clientSecret: 'abcdef1234567890abcdef1234567890abcdef12',
    redirectUri: 'http://zero.cat:3000/account/oauth/github/callback'
  }
};

// 初始化 OAuth 配置
export async function initializeOAuthProviders() {
  // 如果将来需要从配置中读取，可以在这里添加
  logger.info('OAuth providers initialized');
}

// 生成 OAuth 授权 URL
export function generateAuthUrl(provider, state) {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new Error('不支持的 OAuth 提供商');

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scope,
    state: state
  });

  return `${config.authUrl}?${params.toString()}`;
}

// 获取 OAuth 访问令牌
async function getAccessToken(provider, code) {
  const config = OAUTH_PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code'
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString()
  });

  return await response.json();
}

// 获取用户信息的函数映射
const getUserInfoFunctions = {
  google: async (accessToken) => {
    const response = await fetch(OAUTH_PROVIDERS.google.userInfoUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await response.json();
    return {
      id: data.sub,
      email: data.email,
      name: data.name
    };
  },

  microsoft: async (accessToken) => {
    const response = await fetch(OAUTH_PROVIDERS.microsoft.userInfoUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await response.json();
    return {
      id: data.id,
      email: data.mail || data.userPrincipalName,
      name: data.displayName
    };
  },

  github: async (accessToken) => {
    const [userResponse, emailsResponse] = await Promise.all([
      fetch(OAUTH_PROVIDERS.github.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }),
      fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })
    ]);

    const userData = await userResponse.json();
    const emailsData = await emailsResponse.json();
    const primaryEmail = emailsData.find(email => email.primary)?.email || emailsData[0]?.email;

    return {
      id: userData.id.toString(),
      email: primaryEmail,
      name: userData.name || userData.login
    };
  }
};

// 处理 OAuth 回调
export async function handleOAuthCallback(provider, code) {
  try {
    const tokenData = await getAccessToken(provider, code);
    const accessToken = tokenData.access_token;
    
    // 获取用户信息
    const userInfo = await getUserInfoFunctions[provider](accessToken);
    
    // 查找或创建联系方式
    let contact = await prisma.ow_users_contacts.findFirst({
      where: {
        contact_value: userInfo.id,
        contact_type: OAUTH_PROVIDERS[provider].type
      }
    });

    if (!contact) {
      // 查找是否存在相同邮箱的用户
      const emailContact = await prisma.ow_users_contacts.findFirst({
        where: {
          contact_value: userInfo.email,
          contact_type: 'email'
        }
      });

      let userId;
      if (emailContact) {
        // 如果找到相同邮箱的用户，关联到该用户
        userId = emailContact.user_id;
      } else {
        // 创建新用户
        const newUser = await prisma.ow_users.create({
          data: {
            username: `user_${Date.now()}`,  // 临时用户名
            password: null,  // 无密码
            display_name: userInfo.name
          }
        });
        userId = newUser.id;

        // 创建邮箱联系方式
        await prisma.ow_users_contacts.create({
          data: {
            user_id: userId,
            contact_value: userInfo.email,
            contact_hash: '',  // OAuth 用户不需要验证邮箱
            contact_type: 'email',
            is_primary: true,
            verified: true
          }
        });
      }

      // 创建 OAuth 联系方式
      contact = await prisma.ow_users_contacts.create({
        data: {
          user_id: userId,
          contact_value: userInfo.id,
          contact_hash: accessToken,
          contact_type: OAUTH_PROVIDERS[provider].type,
          verified: true
        }
      });
    }

    // 获取用户信息
    const user = await prisma.ow_users.findUnique({
      where: { id: contact.user_id }
    });

    return { user, contact };
  } catch (error) {
    logger.error('OAuth callback error:', error);
    throw error;
  }
}
