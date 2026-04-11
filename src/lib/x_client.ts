import { TwitterApi } from 'twitter-api-v2';

const API_KEY = import.meta.env.VITE_X_API_KEY;
const API_SECRET = import.meta.env.VITE_X_API_SECRET;
const ACCESS_TOKEN = import.meta.env.VITE_X_ACCESS_TOKEN;
const ACCESS_SECRET = import.meta.env.VITE_X_ACCESS_SECRET;

let client: TwitterApi | null = null;

if (API_KEY && API_SECRET && ACCESS_TOKEN && ACCESS_SECRET) {
  client = new TwitterApi({
    appKey: API_KEY,
    appSecret: API_SECRET,
    accessToken: ACCESS_TOKEN,
    accessSecret: ACCESS_SECRET,
  });
  
  // ブラウザ環境（CORS対策）のためにプロキシ経由でリクエストを送る設定
  // Viteのプロキシ設定 (/api/twitter) に合わせる
  // 注: twitter-api-v2 の内部構造に依存するため、失敗した場合はシンプルな fetch に切り替える
  try {
    (client as any)._v2Host = window.location.origin + '/api/twitter/2/';
    (client as any)._v1Host = window.location.origin + '/api/twitter/1.1/';
  } catch (e) {
    console.warn("Proxy setting failed, falling back to direct connection.", e);
  }
}

export async function postToX(text: string) {
  if (!client) {
    throw new Error("X APIの設定が不十分です。.envファイルを確認してください。");
  }

  try {
    const rwClient = client.readWrite;
    await rwClient.v2.tweet(text);
    return { success: true };
  } catch (error) {
    console.error("X post error:", error);
    throw error;
  }
}

export async function likeTweet(tweetId: string) {
  if (!client) return;
  try {
    const me = await client.v2.me();
    await client.v2.like(me.data.id, tweetId);
    return { success: true };
  } catch (error) {
    console.error("X like error:", error);
  }
}

export async function retweet(tweetId: string) {
  if (!client) return;
  try {
    const me = await client.v2.me();
    await client.v2.retweet(me.data.id, tweetId);
    return { success: true };
  } catch (error) {
    console.error("X retweet error:", error);
  }
}

export async function fetchUserTimeline(username: string) {
  if (!client) return [];
  try {
    // スクリーンネームからユーザーIDを取得
    const user = await client.v2.userByUsername(username);
    if (!user.data) return [];
    
    const timeline = await client.v2.userTimeline(user.data.id, { 
      max_results: 5,
      exclude: ['replies', 'retweets']
    });
    return timeline.data.data || [];
  } catch (error) {
    console.error("X fetch timeline error:", error);
    return [];
  }
}

export async function fetchTatsumaruContext() {
  const targetHandle = import.meta.env.VITE_TATSURE_X_HANDLE || "tatsumaru_ws"; // デフォルト
  const tweets = await fetchUserTimeline(targetHandle);
  
  if (tweets.length > 0) {
    return `たつまる様の最近の投稿: "${tweets[0].text}"`;
  }
  
  return "最近、Whiteout Survivalの計算機（最強伝説ラボ）をアップデートしたらしい。";
}

export async function fetchMentions() {
  if (!client) return [];
  try {
    const me = await client.v2.me();
    const mentions = await client.v2.userMentionTimeline(me.data.id, {
      max_results: 5,
      "tweet.fields": ['author_id', 'text', 'created_at']
    });
    return mentions.data.data || [];
  } catch (error) {
    console.error("X fetch mentions error:", error);
    return [];
  }
}

export async function replyToTweet(tweetId: string, text: string) {
  if (!client) return;
  try {
    await client.v2.reply(text, tweetId);
    return { success: true };
  } catch (error) {
    console.error("X reply error:", error);
    throw error;
  }
}
