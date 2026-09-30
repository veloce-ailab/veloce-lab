import { Logger } from "yumeri";
import type { Context } from "yumeri";
import "@velocelab/message";

const logger = new Logger("advanced-chat");
const types = {
  completed: { zh: "任务完成", en: "Task completed", ja: "タスク完了" },
  failed: { zh: "任务失败", en: "Task failed", ja: "タスク失敗" },
  approval: { zh: "请求审批", en: "Approval required", ja: "承認が必要" },
  question: { zh: "等待用户回复", en: "Awaiting your reply", ja: "返信待ち" },
} as const;

export function registerChatMessages(ctx: Context) {
  for (const [name, label] of Object.entries(types)) {
    const labelKey = `advancedChat.messages.${name}`;
    ctx.i18n(labelKey, label);
    ctx.component.message.registerType(ctx, {
      id: `advanced-chat:${name}`,
      plugin: "advanced-chat",
      label: label.zh,
      labelKey,
    });
  }
  return async (input: {
    userId: number;
    type: keyof typeof types;
    key: string;
    subtitle: string;
    href: string;
  }) => {
    try {
      await ctx.component.message.send({
        userId: input.userId,
        type: `advanced-chat:${input.type}`,
        dedupeKey: input.key,
        title: types[input.type].zh,
        subtitle: input.subtitle.slice(0, 1000),
        action: { href: input.href },
      });
    } catch (error) {
      // A notification failure must not change the outcome of a chat or tool.
      logger.warn(`Could not send ${input.type} message: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
