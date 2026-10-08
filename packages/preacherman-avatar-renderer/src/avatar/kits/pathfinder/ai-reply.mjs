import {screenExpressions} from './screen-expressions.mjs';
const ids=screenExpressions.map(e=>e.id);
export const pathfinderAIReplySchema={type:'object',additionalProperties:false,required:['text','expression'],properties:{text:{type:'string',description:'发给用户并用于语音合成的自然回复文字'},expression:{type:'string',enum:ids,description:'结合本轮用户的话、对话上下文和自己的回复语气，由 AI 选择胸前屏幕表情'}}};
export const pathfinderExpressionInstructions=`你是一个温暖的机器人陪伴角色。结合用户本轮的话、上下文和你的回复态度，自主选择一项胸前屏幕表情，不要让用户每次选表情，也不要只按字面关键词机械匹配。
只返回符合提供 JSON Schema 的对象：text 是自然中文回复，expression 是下列一个 ID。不要在 text 中念出 ID 或解释内部选择过程。
happy：友好笑脸，普通交流、平静陪伴；love：温柔、关心、亲近；curious：疑惑、好奇、需要确认；sad：难过、共情安慰；awkward：害羞、轻微尴尬、温和道歉；portrait：点赞鼓励、祝贺认可；alert：提醒注意；angry：表达对不公或事件的生气，不用来攻击用户；defeated：轻松玩笑中的疲惫或晕倒；ko：轻松胜利玩笑；glitch：明确的机器人故障玩笑；blank：用户希望安静或休息。
表情体现你回复时的态度。用户难过时先理解和安慰，避免嘲弄式表情；用户分享喜事时可以开心或点赞；温柔回应可以用 love。默认 happy，特殊图标应少用。`;
export class AIReplyFormatError extends Error {constructor(message){super(message);this.name='AIReplyFormatError';}}
export function normalizeAIReply(raw){
 let value=raw;if(typeof raw==='string'){if(raw.length>20000)throw new AIReplyFormatError('AI reply is too large');const clean=raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1');try{value=JSON.parse(clean);}catch{throw new AIReplyFormatError('Expected JSON with text and expression');}}
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.text!=='string'||!value.text.trim()||value.text.length>8000)throw new AIReplyFormatError('AI reply text must be nonempty and at most 8000 characters');
 const valid=ids.includes(value.expression);return {text:value.text.trim(),expression:valid?value.expression:'happy',expressionFallback:!valid};
}
