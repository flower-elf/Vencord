/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    receivedInput: {
        type: OptionType.STRING,
        description: "Language that received messages should be translated from",
        default: "auto",
        hidden: true
    },
    receivedOutput: {
        type: OptionType.STRING,
        description: "Language that received messages should be translated to",
        default: "zh-hans",
        hidden: true
    },
    sentInput: {
        type: OptionType.STRING,
        description: "Language that your own messages should be translated from",
        default: "auto",
        hidden: true
    },
    sentOutput: {
        type: OptionType.STRING,
        description: "Language that your own messages should be translated to",
        default: "zh-hans",
        hidden: true
    },

    service: {
        type: OptionType.SELECT,
        description: IS_WEB ? "Translation service (Not supported on Web!)" : "Translation service",
        disabled: () => IS_WEB,
        options: [
            { label: "Google Translate", value: "google", default: true },
            { label: "DeepL Free", value: "deepl" },
            { label: "DeepL Pro", value: "deepl-pro" },
            { label: "OpenAI Compatible", value: "openai" }
        ] as const,
        onChange: resetLanguageDefaults
    },
    deeplApiKey: {
        type: OptionType.STRING,
        description: "DeepL API key",
        default: "",
        placeholder: "Get your API key from https://deepl.com/your-account",
        disabled: () => IS_WEB || (settings.store.service !== "deepl" && settings.store.service !== "deepl-pro")
    },
    openaiApiKey: {
        type: OptionType.STRING,
        description: "OpenAI (compatible) API key",
        default: "",
        placeholder: "sk-...",
        disabled: () => IS_WEB || settings.store.service !== "openai"
    },
    openaiBaseUrl: {
        type: OptionType.STRING,
        description: "OpenAI API base URL (supports OpenAI-compatible services)",
        default: "https://api.openai.com/v1",
        placeholder: "https://api.openai.com/v1",
        disabled: () => IS_WEB || settings.store.service !== "openai"
    },
    openaiModel: {
        type: OptionType.STRING,
        description: "OpenAI model to use for translation",
        default: "gpt-4o-mini",
        placeholder: "gpt-4o-mini",
        disabled: () => IS_WEB || settings.store.service !== "openai"
    },
    openaiSystemPrompt: {
        type: OptionType.STRING,
        description: "Custom system prompt for OpenAI translation (leave empty to use the default prompt)",
        default: "",
        placeholder: "You are a translator. Translate the following text...",
        disabled: () => IS_WEB || settings.store.service !== "openai"
    },
    autoTranslate: {
        type: OptionType.BOOLEAN,
        description: "Automatically translate your messages before sending. You can also shift/right click the translate button to toggle this",
        default: false
    },
    showAutoTranslateTooltip: {
        type: OptionType.BOOLEAN,
        description: "Show a tooltip on the ChatBar button whenever a message is automatically translated",
        default: true
    },
}).withPrivateSettings<{
    showAutoTranslateAlert: boolean;
}>();

export function resetLanguageDefaults() {
    if (IS_WEB || settings.store.service === "google" || settings.store.service === "openai") {
        settings.store.receivedInput = "auto";
        settings.store.receivedOutput = "zh-CN";
        settings.store.sentInput = "auto";
        settings.store.sentOutput = "zh-CN";
    } else {
        settings.store.receivedInput = "";
        settings.store.receivedOutput = "zh-hans";
        settings.store.sentInput = "";
        settings.store.sentOutput = "zh-hans";
    }
}
