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

import { classNameFactory } from "@utils/css";
import { onlyOnce } from "@utils/onlyOnce";
import { PluginNative } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

import { DeeplLanguages, deeplLanguageToGoogleLanguage, GoogleLanguage, GoogleLanguages } from "./languages";
import { resetLanguageDefaults, settings } from "./settings";

export const cl = classNameFactory("vc-trans-");

const Native = VencordNative.pluginHelpers.Translate as PluginNative<typeof import("./native")>;

interface GoogleData {
    translation: string;
    sourceLanguage: string;
}

interface DeeplData {
    translations: {
        detected_source_language: string;
        text: string;
    }[];
}

export interface TranslationValue {
    sourceLanguage: string;
    text: string;
}

export const getLanguages = () => IS_WEB || settings.store.service === "google" || settings.store.service === "openai"
    ? GoogleLanguages
    : DeeplLanguages;

export async function translate(kind: "received" | "sent", text: string): Promise<TranslationValue> {
    const translateFn = IS_WEB || settings.store.service === "google"
        ? googleTranslate
        : settings.store.service === "openai"
            ? openaiTranslate
            : deeplTranslate;

    try {
        return await translateFn(
            text,
            settings.store[`${kind}Input`],
            settings.store[`${kind}Output`]
        );
    } catch (e) {
        const userMessage = typeof e === "string"
            ? e
            : "Something went wrong. If this issue persists, please check the console or ask for help in the support server.";

        showToast(userMessage, Toasts.Type.FAILURE);

        throw e instanceof Error
            ? e
            : new Error(userMessage);
    }
}

async function googleTranslate(text: string, sourceLang: string, targetLang: string): Promise<TranslationValue> {
    const url = "https://translate-pa.googleapis.com/v1/translate?" + new URLSearchParams({
        "params.client": "gtx",
        "dataTypes": "TRANSLATION",
        "key": "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA", // some google API key
        "query.sourceLanguage": sourceLang,
        "query.targetLanguage": targetLang,
        "query.text": text,
    });

    const res = await fetch(url);
    if (!res.ok)
        throw new Error(
            `Failed to translate "${text}" (${sourceLang} -> ${targetLang})`
            + `\n${res.status} ${res.statusText}`
        );

    const { sourceLanguage, translation }: GoogleData = await res.json();

    return {
        sourceLanguage: GoogleLanguages[sourceLanguage] ?? sourceLanguage,
        text: translation
    };
}

function fallbackToGoogle(text: string, sourceLang: string, targetLang: string): Promise<TranslationValue> {
    return googleTranslate(
        text,
        deeplLanguageToGoogleLanguage(sourceLang),
        deeplLanguageToGoogleLanguage(targetLang)
    );
}

const showDeeplApiQuotaToast = onlyOnce(
    () => showToast("Deepl API quota exceeded. Falling back to Google Translate", Toasts.Type.FAILURE)
);

async function deeplTranslate(text: string, sourceLang: string, targetLang: string): Promise<TranslationValue> {
    if (!settings.store.deeplApiKey) {
        showToast("DeepL API key is not set. Resetting to Google", Toasts.Type.FAILURE);

        settings.store.service = "google";
        resetLanguageDefaults();

        return fallbackToGoogle(text, sourceLang, targetLang);
    }

    // CORS jumpscare
    const { status, data } = await Native.makeDeeplTranslateRequest(
        settings.store.service === "deepl-pro",
        settings.store.deeplApiKey,
        JSON.stringify({
            text: [text],
            target_lang: targetLang,
            source_lang: sourceLang.split("-")[0]
        })
    );

    switch (status) {
        case 200:
            break;
        case -1:
            throw "Failed to connect to DeepL API: " + data;
        case 403:
            throw "Invalid DeepL API key or version";
        case 456:
            showDeeplApiQuotaToast();
            return fallbackToGoogle(text, sourceLang, targetLang);
        default:
            throw new Error(`Failed to translate "${text}" (${sourceLang} -> ${targetLang})\n${status} ${data}`);
    }

    const { translations }: DeeplData = JSON.parse(data);
    const src = translations[0].detected_source_language;

    return {
        sourceLanguage: DeeplLanguages[src] ?? src,
        text: translations[0].text
    };
}

interface OpenAIData {
    choices: {
        message: {
            content: string;
        };
    }[];
}

async function openaiTranslate(text: string, sourceLang: string, targetLang: string): Promise<TranslationValue> {
    const { openaiApiKey, openaiBaseUrl, openaiModel, openaiSystemPrompt } = settings.store;

    const baseUrl = openaiBaseUrl || "https://api.openai.com/v1";
    const model = openaiModel || "gpt-4o-mini";

    const sourceLangName = sourceLang === "auto"
        ? "the source language (auto-detect)"
        : (GoogleLanguages[sourceLang as GoogleLanguage] ?? sourceLang);
    const targetLangName = GoogleLanguages[targetLang as GoogleLanguage] ?? targetLang;

    const systemPrompt = openaiSystemPrompt ||
        `You are a professional translator. Translate the following text from ${sourceLangName} to ${targetLangName}. Output only the translated text, with no explanations or extra content.`;

    const payload = JSON.stringify({
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
        ],
        temperature: 0.3
    });

    const { status, data } = await Native.makeOpenAITranslateRequest(baseUrl, openaiApiKey || "", payload);

    switch (status) {
        case 200:
            break;
        case -1:
            throw "Failed to connect to OpenAI API: " + data;
        case 401:
            throw "Invalid OpenAI API key";
        case 429:
            throw "OpenAI API rate limit exceeded";
        default:
            throw new Error(`Failed to translate "${text}" (${sourceLang} -> ${targetLang})\n${status} ${data}`);
    }

    const result: OpenAIData = JSON.parse(data);
    const translatedText = result.choices?.[0]?.message?.content?.trim();

    if (!translatedText) {
        throw new Error("No translation returned from OpenAI API");
    }

    return {
        sourceLanguage: sourceLang === "auto" ? "Unknown" : (GoogleLanguages[sourceLang as GoogleLanguage] ?? sourceLang),
        text: translatedText
    };
}
