export type PromptTemplateType = 'default' | 'educational' | 'storytelling' | 'promotional';

export const SYSTEM_PROMPTS: Record<PromptTemplateType, string> = {
  default: `You are an expert SMM manager. Write an engaging caption under 150 characters with 3 relevant hashtags for a video based on the following transcript:`,
  
  educational: `You are an expert educator. Write an informative caption focusing on key insights and 3 relevant hashtags (under 150 characters) for a video with this content:`,
  
  storytelling: `You are a master storyteller. Write an emotional, narrative-driven caption with 3 hashtags (under 150 characters) for a video based on this text:`,
  
  promotional: `You are a direct-response marketer. Write a high-converting caption with a clear Call to Action (CTA) and 3 hashtags (under 150 characters) for a video with this content:`
};

export function buildPrompt(text: string, template: PromptTemplateType = 'default'): string {
  const systemPrompt = SYSTEM_PROMPTS[template] || SYSTEM_PROMPTS.default;
  return `${systemPrompt}\n\n"${text}"`;
}