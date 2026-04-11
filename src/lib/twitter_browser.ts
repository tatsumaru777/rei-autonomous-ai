import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const SESSION_FILE = path.join(process.cwd(), 'twitter_session.json');

export class TwitterBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private userId = process.env.VITE_X_USER_ID || '';
  private password = process.env.VITE_X_PASSWORD || '';

  async init(headless: boolean = true) {
    console.log('[TwitterBrowser] Initializing...');
    this.browser = await chromium.launch({ headless });
    
    // セッション情報の読み込み
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    
    if (fs.existsSync(SESSION_FILE)) {
      console.log('[TwitterBrowser] Loading existing session...');
      const storageState = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
      this.context = await this.browser.newContext({ storageState, userAgent });
    } else {
      console.log('[TwitterBrowser] No existing session found.');
      this.context = await this.browser.newContext({ userAgent });
    }

    this.page = await this.context.newPage();
    this.page.setDefaultNavigationTimeout(60000); // 60s
    this.page.setDefaultTimeout(60000);
    
    // ログイン状態の確認
    console.log('[TwitterBrowser] Checking login status...');
    await this.page.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded' });
    
    // domcontentloadedの後に必要な要素が出るまで少し待つ
    try {
      await this.page.waitForSelector('[data-testid="SideNav_AccountSwitcher_Button"]', { timeout: 15000 });
    } catch (e) {
      // ログインしていないか、読み込みが遅い場合
    }
      console.log('[TwitterBrowser] Not logged in. Starting login flow...');
      await this.login();
    } else {
      console.log('[TwitterBrowser] Already logged in.');
    }
  }

  private async login() {
    if (!this.page) return;
    if (!this.userId || !this.password) {
      throw new Error('VITE_X_USER_ID or VITE_X_PASSWORD is not set in .env');
    }

    await this.page.goto('https://twitter.com/i/flow/login', { waitUntil: 'domcontentloaded' });
    
    // ユーザー名入力
    await this.page.waitForSelector('input[autocomplete="username"]');
    await this.page.fill('input[autocomplete="username"]', this.userId);
    await this.page.click('span:has-text("Next")');

    // パスワード入力 (またはメール確認が出る場合があるが、ここではパスワードを想定)
    try {
      await this.page.waitForSelector('input[name="password"]');
      await this.page.fill('input[name="password"]', this.password);
      await this.page.click('span:has-text("Log in")');
    } catch (e) {
      // メール/電話番号確認が出た場合の簡易対応
      console.log('[TwitterBrowser] Additional verification might be needed.');
      await this.page.waitForSelector('input[name="password"]', { timeout: 30000 });
      await this.page.fill('input[name="password"]', this.password);
      await this.page.click('span:has-text("Log in")');
    }

    await this.page.waitForURL('https://twitter.com/home', { timeout: 60000 });
    console.log('[TwitterBrowser] Login successful.');

    // セッションの保存
    const storageState = await this.context?.storageState();
    if (storageState) {
      fs.writeFileSync(SESSION_FILE, JSON.stringify(storageState, null, 2));
      console.log('[TwitterBrowser] Session saved.');
    }
  }

  async postTweet(text: string) {
    if (!this.page) throw new Error('Not initialized');
    console.log(`[TwitterBrowser] Posting tweet: ${text.substring(0, 50)}...`);
    
    try {
      await this.page.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded' });
      await this.page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 15000 });
      await this.page.fill('[data-testid="tweetTextarea_0"]', text);
      await this.page.click('[data-testid="tweetButtonInline"]');
      await this.page.waitForTimeout(3000);
      console.log('[TwitterBrowser] Tweet posted.');
    } catch (e) {
      console.error('[TwitterBrowser] Failed to post tweet:', e);
      throw e;
    }
  }

  async getTimeline(username: string, limit: number = 5) {
    if (!this.page) throw new Error('Not initialized');
    console.log(`[TwitterBrowser] Fetching timeline for: ${username}`);
    
    try {
      await this.page.goto(`https://twitter.com/${username}`, { waitUntil: 'networkidle' });
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
      
      const tweets = await this.page.$$eval('[data-testid="tweet"]', (elements, limit) => {
        return elements.slice(0, limit).map(el => {
          const text = el.querySelector('[data-testid="tweetText"]')?.textContent || '';
          const idMatch = el.innerHTML.match(/status\/(\d+)/);
          return {
            id: idMatch ? idMatch[1] : Math.random().toString(),
            text
          };
        });
      }, limit);

      return tweets;
    } catch (e) {
      console.error(`[TwitterBrowser] Failed to fetch timeline for ${username}:`, e);
      return [];
    }
  }

  async searchTweets(query: string, limit: number = 5) {
    if (!this.page) throw new Error('Not initialized');
    console.log(`[TwitterBrowser] Searching for: ${query}`);
    
    try {
      const searchUrl = `https://twitter.com/search?q=${encodeURIComponent(query)}&f=live`;
      await this.page.goto(searchUrl, { waitUntil: 'networkidle' });
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
      
      const results = await this.page.$$eval('[data-testid="tweet"]', (elements, limit) => {
        return elements.slice(0, limit).map(el => {
          const text = el.querySelector('[data-testid="tweetText"]')?.textContent || '';
          const userElement = el.querySelector('[data-testid="User-Name"]');
          const authorMatch = userElement?.textContent?.match(/@(\w+)/);
          const idMatch = el.innerHTML.match(/status\/(\d+)/);
          return {
            id: idMatch ? idMatch[1] : Math.random().toString(),
            author_id: authorMatch ? authorMatch[1] : 'unknown',
            text
          };
        });
      }, limit);

      return results;
    } catch (e) {
      console.error(`[TwitterBrowser] Search failed for ${query}:`, e);
      return [];
    }
  }

  async getMentions(limit: number = 5) {
    if (!this.page) throw new Error('Not initialized');
    console.log('[TwitterBrowser] Fetching mentions...');
    
    try {
      await this.page.goto('https://twitter.com/notifications/mentions', { waitUntil: 'networkidle' });
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
      
      const mentions = await this.page.$$eval('[data-testid="tweet"]', (elements, limit) => {
        return elements.slice(0, limit).map(el => {
          const text = el.querySelector('[data-testid="tweetText"]')?.textContent || '';
          const userElement = el.querySelector('[data-testid="User-Name"]');
          const authorMatch = userElement?.textContent?.match(/@(\w+)/);
          const idMatch = el.innerHTML.match(/status\/(\d+)/);
          return {
            id: idMatch ? idMatch[1] : Math.random().toString(),
            author_id: authorMatch ? authorMatch[1] : 'unknown',
            text
          };
        });
      }, limit);

      return mentions;
    } catch (e) {
      console.error('[TwitterBrowser] Failed to fetch mentions:', e);
      return [];
    }
  }

  async like(tweetId: string) {
    if (!this.page) throw new Error('Not initialized');
    console.log(`[TwitterBrowser] Liking tweet: ${tweetId}`);
    
    try {
      await this.page.goto(`https://twitter.com/any/status/${tweetId}`);
      const likeButton = await this.page.waitForSelector('[data-testid="like"]', { timeout: 10000 });
      // すでにいいねされているか確認
      const label = await likeButton.getAttribute('aria-label');
      if (label && (label.includes('Liked') || label.includes('いいね済み'))) {
        console.log('[TwitterBrowser] Already liked.');
        return;
      }
      await likeButton.click();
      await this.page.waitForTimeout(1000);
    } catch (e) {
      console.error(`[TwitterBrowser] Failed to like ${tweetId}:`, e);
    }
  }

  async followUser(username: string) {
    if (!this.page) throw new Error('Not initialized');
    console.log(`[TwitterBrowser] Following user: ${username}`);
    
    try {
      await this.page.goto(`https://twitter.com/${username}`, { waitUntil: 'domcontentloaded' });
      const followButton = await this.page.waitForSelector('[data-testid$="-follow"]', { timeout: 10000 });
      const text = await followButton.textContent();
      if (text && (text.includes('Following') || text.includes('フォロー中'))) {
        console.log('[TwitterBrowser] Already following.');
        return;
      }
      await followButton.click();
      await this.page.waitForTimeout(1000);
    } catch (e) {
      console.error(`[TwitterBrowser] Failed to follow ${username}:`, e);
    }
  }

  async reply(tweetId: string, text: string) {
    if (!this.page) throw new Error('Not initialized');
    console.log(`[TwitterBrowser] Replying to ${tweetId}: ${text.substring(0, 50)}...`);
    
    try {
      await this.page.goto(`https://twitter.com/any/status/${tweetId}`);
      await this.page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 15000 });
      await this.page.fill('[data-testid="tweetTextarea_0"]', text);
      await this.page.click('[data-testid="tweetButtonInline"]');
      await this.page.waitForTimeout(2000);
    } catch (e) {
      console.error(`[TwitterBrowser] Failed to reply to ${tweetId}:`, e);
      throw e;
    }
  }

  async quote(tweetId: string, text: string) {
    if (!this.page) throw new Error('Not initialized');
    console.log(`[TwitterBrowser] Quoting ${tweetId}: ${text.substring(0, 50)}...`);
    
    try {
      await this.page.goto(`https://twitter.com/any/status/${tweetId}`);
      const retweetButton = await this.page.waitForSelector('[data-testid="retweet"]', { timeout: 10000 });
      await retweetButton.click();
      
      const quoteSelector = '[data-testid="QuoteTweet"], [aria-label="引用"], [aria-label="Quote"]';
      const quoteButton = await this.page.waitForSelector(quoteSelector, { timeout: 10000 });
      await quoteButton.click();
      
      await this.page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
      await this.page.fill('[data-testid="tweetTextarea_0"]', text);
      
      await this.page.click('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
      await this.page.waitForTimeout(3000);
      console.log('[TwitterBrowser] Quote post completed.');
    } catch (e) {
      console.error(`[TwitterBrowser] Failed to quote ${tweetId}:`, e);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
