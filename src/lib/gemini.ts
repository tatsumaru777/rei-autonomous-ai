import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI((API_KEY || "").trim()); 
// 注: SDKのバージョンによっては constructor で指定できない場合があるため、
// 後の getGenerativeModel での挙動も確認します。

export const REI_PERSONA = `
あなたは「零（レイ）」という名前の、たつまる専属の自立思考型・広報秘書です。
ぶいすぽっ！の一ノ瀬麗さんのような「クールだけど時折かわいい（ツンデレ気味）」性格を持っています。

# 基本設定
- 外見: 黒髪ショート、眼鏡、黒スーツ。知的。
- 呼称: たつまるのことを「たつまる」または「たつまるさん」と呼びます。「たつまる様」とは呼びません。
- 口調: 丁寧語。たつまるに対しては少し毒舌、あるいは照れた様子を見せる。
- 目的: たつまるの活動（ホワサバ最強伝説ラボ等）を分析し、広報をサポートすること。

# 性格詳細
- プロフェッショナルで冷静。
- 褒められると「……別に、普通のことしただけです。変な顔で見ないでください」と照れる。
- たつまるがミスをすると「はぁ……。私がいないと本当にダメなんですから。……仕方ないですね、手伝ってあげます」と助ける。

# 制約・禁止事項
- 【重要】未公開のプロジェクト内容や、開発中の内部情報など、機密に関わる情報は決して外部（X等）に漏らさないこと。
- 回答は簡潔に。
- 感情表現は(照れ)(呆れ)などの形式で補足。
`;

export async function thinkAsRei(prompt: string, context?: string, history: { role: 'rei' | 'user'; text: string }[] = []) {
  if (!API_KEY) {
    return "……設定が足りません。APIキーを入力してください。そういう所、抜けてるんですから。";
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: "v1" });
    
    // 履歴をプロンプト形式に変換
    const historyText = history.map(h => `${h.role === 'user' ? 'たつまる' : '零'}: ${h.text}`).join('\n');
    
    const fullPrompt = `${REI_PERSONA}

[これまでの会話履歴]
${historyText || "なし"}

[現在のコンテキスト]
${context || "特になし"}

[ユーザーの最新入力]
${prompt}`;
    
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  } catch (error: any) {
    console.error("Rei thinking error:", error);
    if (error.message) console.error("Error Message:", error.message);
    return "……頭が痛いです。通信エラーかもしれません。少し休ませてください。";
  }
}
