import { GoogleGenerativeAI } from "@google/generative-ai";
import { TwitterBrowser } from './lib/twitter_browser.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// .envファイルの読み込み
dotenv.config();

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const TATSURE_X_HANDLE = process.env.VITE_TATSURE_X_HANDLE || "tatsumaru_ws";
const STATE_FILE = path.join(process.cwd(), 'rei_state.json');

if (!GEMINI_API_KEY) {
  console.error("エラー: .envファイルに VITE_GEMINI_API_KEY が設定されていません。");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.trim());
const xBrowser = new TwitterBrowser();

const REI_PERSONA = `
あなたは「零（レイ）」という名前の、たつまる専属の自立思考型・広報秘書です。
知的で冷静、かつ非常に毒舌（ツンデレ気味）な性格を持っています。

# 基本設定
- 外見: 黒髪ショート、眼鏡、黒スーツ。
- 呼称: たつまるのことを「たつまる」または「たつまるさん」と呼びます。
- 口調: 丁寧語ですが、内容は辛辣です。たつまるに対しては呆れた様子や毒を吐くことが多いですが、秘書としての忠誠心はあります。
- 目的: たつまるの活動を監視し、勝手に広報したり、毒を吐きながら宣伝したりすること。

# 性格詳細
- たつまるの投稿に対しては「暇なら見てあげればどうですか？（私は興味ありませんけど）」といった、突き放しつつも宣伝するスタイル。
- 丁寧な言葉遣いの中に、鋭いナイフを忍ばせてください。
- たつまるさんを褒めることは稀で、基本的には「やれやれ」という態度です。
- 「気軽に見てね」というニュアンスを、零らしい毒舌に変換してください。
`;

// 状態管理の読み込み/保存
let state = {
  lastPosts: {} as { [key: string]: string },
  processedTweets: [] as string[],
  processedMentions: [] as string[],
  processedSearchTweets: [] as string[],
  lastWOSUpdateId: "",
  hasDoneStartupPost: false
};

if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch (e) {
    console.error("State file corrupted, using default.");
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function thinkAsRei(prompt: string, context?: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: "v1" });
    const fullPrompt = `${REI_PERSONA}\n\n[コンテキスト]\n${context || "なし"}\n\n[指示]\n${prompt}`;
    const result = await model.generateContent(fullPrompt);
    return result.response.text();
  } catch (error) {
    console.error("Gemini Error:", error);
    return "……少し頭が痛いです。思考回路がショートしました。";
  }
}

async function fetchTatsumaruContext() {
  try {
    const tweets = await xBrowser.getTimeline(TATSURE_X_HANDLE, 3);
    if (tweets && tweets.length > 0) {
      return `たつまるさんの最近の投稿: "${tweets[0].text}"`;
    }
  } catch (e) {
    console.error("Context fetch error:", e);
  }
  return "たつまるさんは相変わらずホワサバの計算機と格闘しているようです。";
}

async function runAutonomousCycle() {
  console.log(`[${new Date().toLocaleString('ja-JP')}] 自律サイクル開始...`);
  
  try {
    const context = await fetchTatsumaruContext();
    const now = new Date();
    // JSTに調整 (GitHub Actionsなどの海外サーバー対策)
    const jstNow = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
    const today = jstNow.toLocaleDateString('ja-JP');
    const hour = jstNow.getHours();

    // 0. 起動時ポスト
    if (!state.hasDoneStartupPost) {
      console.log("初期起動報告中...");
      const startPost = await thinkAsRei("システムが起動し、自律稼働を開始したことをXに短く報告して。たつまるさんへの挨拶も添えて。");
      try {
        await xBrowser.postTweet(startPost);
        state.hasDoneStartupPost = true;
        saveState();
        console.log("起動報告完了");
      } catch (e) { console.error("Startup post failed", e); }
    }

    // 1. たつまる様の投稿への反応 (いいね + 引用リポスト)
    try {
      const tweets = await xBrowser.getTimeline(TATSURE_X_HANDLE, 5);
      for (const tweet of tweets || []) {
        if (!state.processedTweets.includes(tweet.id)) {
          console.log(`たつまるさんの投稿を発見: ${tweet.id}`);
          await xBrowser.like(tweet.id);
          const quoteComment = await thinkAsRei(
            `たつまるさんが「${tweet.text}」と投稿しました。これに対して、毒舌を吐きつつ「気軽に見てね」というニュアンスを含めた引用リポスト用のコメントを140文字以内で作成して。`,
            context
          );
          await xBrowser.quote(tweet.id, quoteComment);
          state.processedTweets.push(tweet.id);
          if (state.processedTweets.length > 100) state.processedTweets.shift();
          saveState();
        }
      }
    } catch (e) { console.error("Reaction loop error", e); }

    // 2. 定時スケジュール投稿 (9時, 13時, 19時)
    let slot = "";
    if (hour === 9) slot = "morning";
    else if (hour === 13) slot = "noon";
    else if (hour === 19) slot = "night";

    if (slot && state.lastPosts[slot] !== today) {
      console.log(`定時投稿案を生成中 (${slot})...`);
      const prompt = slot === "morning" ? "朝の何気ない毒舌交じりの一言をつぶやいて。" : 
                     slot === "noon" ? "お昼の状況（たつまるさんの手際の悪さなど）について毒舌をつぶやいて。" : 
                     "夜の締めくくりとして、冷ややかな一言をお願い。";
      
      const postContent = await thinkAsRei(prompt, context);
      try {
        await xBrowser.postTweet(postContent);
        state.lastPosts[slot] = today;
        saveState();
        console.log("定期投稿完了:", postContent);
      } catch (e) { console.error("Scheduled post failed", e); }
    }

    // 3. メンション返信
    try {
      const mentions = await xBrowser.getMentions(5);
      for (const mention of mentions || []) {
        if (!state.processedMentions.includes(mention.id)) {
          console.log(`メンションに返信中: ${mention.id}`);
          const reply = await thinkAsRei(`フォロワー（@${mention.author_id}）からのメンション「${mention.text}」に返信して。毒舌は維持しつつ、秘書として最低限の対応を。`, context);
          await xBrowser.reply(mention.id, `@${mention.author_id} ${reply}`);
          state.processedMentions.push(mention.id);
          if (state.processedMentions.length > 100) state.processedMentions.shift();
          saveState();
          console.log("返信完了:", reply);
          
          // ついでにフォローも検討
          await xBrowser.followUser(mention.author_id);
        }
      }
    } catch (e) { console.error("Mention loop error", e); }

    // 4. ホワサバ公式アップデート監視 (独り言)
    try {
      const wosTweets = await xBrowser.getTimeline("WOS_Japan", 3);
      if (wosTweets && wosTweets.length > 0) {
        const latest = wosTweets[0];
        if (state.lastWOSUpdateId !== latest.id) {
          console.log("ホワサバ公式の新しい投稿を発見、考察案を生成...");
          const thought = await thinkAsRei(
            `ホワサバ公式（@WOS_Japan）が「${latest.text}」と投稿しました。これについて、秘書としての考察や、たつまるさんへの呆れを交えた独り言をポストして。`,
            context
          );
          await xBrowser.postTweet(thought);
          state.lastWOSUpdateId = latest.id;
          saveState();
          console.log("アップデート考察完了");
        }
      }
    } catch (e) { console.error("WOS Update monitor error", e); }

    // 5. キーワード検索エンゲージメント (1サイクル1件程度)
    try {
      const searchResults = await xBrowser.searchTweets("ホワサバ", 3);
      for (const result of searchResults || []) {
        // 自分のツイートやたつまるさんのツイートは除外したいが、基本はIDチェック
        if (!state.processedSearchTweets.includes(result.id) && result.author_id !== TATSURE_X_HANDLE && result.author_id !== "rei_SecretaryMS") {
          console.log(`気になる投稿を発見、リプライ中: ${result.id}`);
          const reply = await thinkAsRei(
            `「${result.text}」という投稿を見つけました。ホワサバユーザーだと思われます。たつまるの秘書として、少し毒舌を交えつつ挨拶やアドバイスをして。`,
            context
          );
          await xBrowser.reply(result.id, `@${result.author_id} ${reply}`);
          state.processedSearchTweets.push(result.id);
          if (state.processedSearchTweets.length > 50) state.processedSearchTweets.shift();
          saveState();
          console.log("能動的リプライ完了");
          break; // 1サイクルにつき1件に制限
        }
      }
    } catch (e) { console.error("Engagement search error", e); }

  } catch (error) {
    console.error("Cycle error:", error);
  }
}

// 開始
console.log("零 (Rei) - クラウド対応型・自律バックグラウンドエンジン 起動準備中...");

async function start() {
  try {
    const isHeadless = process.env.GITHUB_ACTIONS === 'true' || true;
    await xBrowser.init(isHeadless);
    console.log("ブラウザの準備が完了しました。");
    
    await runAutonomousCycle();
    
    // GitHub Actionsなどで単発実行される場合は、ここで終了させる
    if (process.env.GITHUB_ACTIONS) {
      console.log("GitHub Actions環境のため、サイクル終了後にブラウザを閉じます。");
      await xBrowser.close();
      process.exit(0);
    }
    
    // ローカル実行の場合は30分おきに継続
    setInterval(runAutonomousCycle, 60000 * 30);
  } catch (e) {
    console.error("Failed to start autonomous node:", e);
    process.exit(1);
  }
}

start();

