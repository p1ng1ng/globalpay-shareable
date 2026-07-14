"use client";

import { useEffect, useMemo } from "react";
import {
  reverseUiPhraseTranslations,
  uiPhraseTranslations,
} from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

const originalText = new WeakMap<Text, string>();
const originalPlaceholders = new WeakMap<HTMLElement, string>();

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shouldSkip(node: Text) {
  const parent = node.parentElement;
  if (!parent) return true;

  return Boolean(
    parent.closest(
      "script,style,noscript,textarea,code,pre,[data-no-translate]"
    )
  );
}

function translatePlaceholder(element: HTMLElement, phraseMap: Record<string, string>, reverseMap: Record<string, string>, language: "en" | "zh") {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return;
  }

  const placeholder = element.getAttribute("placeholder");
  if (!placeholder) return;

  const normalized = normalizeText(placeholder);
  const storedPlaceholder = originalPlaceholders.get(element);
  
  const translatedFromEnglish = phraseMap[normalized];
  const englishFromTranslation = reverseMap[normalized];
  
  const basePlaceholder = storedPlaceholder || englishFromTranslation || normalized;
  
  if (!originalPlaceholders.has(element)) {
    originalPlaceholders.set(element, basePlaceholder);
  }
  
  if (language === "zh") {
    const translated = phraseMap[basePlaceholder] || phraseMap[normalized];
    if (translated && element.getAttribute("placeholder") !== translated) {
      element.setAttribute("placeholder", translated);
    }
  } else {
    const english = originalPlaceholders.get(element) || reverseMap[normalized];
    if (english && element.getAttribute("placeholder") !== english) {
      element.setAttribute("placeholder", english);
    }
  }
}

export default function TranslationRuntime() {
  const { language } = useLanguage();

  const phraseMap = useMemo(() => uiPhraseTranslations, []);
  const reverseMap = useMemo(() => reverseUiPhraseTranslations, []);

  useEffect(() => {
    function translateTextNode(node: Text) {
      if (shouldSkip(node)) return;

      const current = normalizeText(node.nodeValue || "");
      if (!current) return;

      const storedText = originalText.get(node);
      const translatedFromEnglish = phraseMap[current];
      const englishFromTranslation = reverseMap[current];

      if (!storedText && !translatedFromEnglish && !englishFromTranslation) {
        return;
      }

      const baseText = storedText || englishFromTranslation || current;

      if (!originalText.has(node)) {
        originalText.set(node, baseText);
      }

      if (language === "zh") {
        const translated = phraseMap[baseText] || phraseMap[current];
        if (translated && node.nodeValue !== translated) {
          node.nodeValue = translated;
        }
        return;
      }

      const english = originalText.get(node) || reverseMap[current];
      if (english && node.nodeValue !== english) {
        node.nodeValue = english;
      }
    }

    function walk(root: ParentNode) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        translateTextNode(node as Text);
        node = walker.nextNode();
      }
      
      // Translate placeholders
      const inputs = root.querySelectorAll("input[placeholder], textarea[placeholder]");
      inputs.forEach((input) => {
        translatePlaceholder(input as HTMLElement, phraseMap, reverseMap, language);
      });
    }

    walk(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target instanceof Text) {
          translateTextNode(mutation.target);
        }
        
        if (mutation.type === "attributes" && mutation.attributeName === "placeholder") {
          const target = mutation.target as HTMLElement;
          translatePlaceholder(target, phraseMap, reverseMap, language);
        }

        mutation.addedNodes.forEach((node) => {
          if (node instanceof Text) {
            translateTextNode(node);
            return;
          }

          if (node instanceof HTMLElement) {
            walk(node);
            
            // Translate placeholder if the added node has one
            if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
              if (node.hasAttribute("placeholder")) {
                translatePlaceholder(node, phraseMap, reverseMap, language);
              }
            }
          }
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder"],
      subtree: true,
    });

    return () => observer.disconnect();
  }, [language, phraseMap, reverseMap]);

  return null;
}
