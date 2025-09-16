"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useConversation } from "@11labs/react";
import { cn } from "@/lib/utils";
import { Loader, Square } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

// Load menu from public folder
async function fetchMenu() {
  const res = await fetch("/caribou_menu_items.json");
  const data = await res.json();
  return data.map((item: any, idx: number) => ({
    name: item.name ?? `Item ${idx + 1}`,
    price_kwd: item.price_kwd,
    arabic_name: item.arabic_name,
  }));
}

async function requestMicrophonePermission() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch {
    console.error("Microphone permission denied");
    return false;
  }
}

async function getSignedUrl(): Promise<string> {
  const response = await fetch("/api/signed-url");
  if (!response.ok) {
    throw Error("Failed to get signed url");
  }
  const data = await response.json();
  return data.signedUrl;
}

export function ConvAI() {
  const [connecting, setConnecting] = useState(false);
  const [menu, setMenu] = useState<{ name: string; price_kwd: string, arabic_name: string }[]>([]);
  const [recognizedItems, setRecognizedItems] = useState<{ name: string; quantity: number }[]>([]);
  const [hasSpokenTotal, setHasSpokenTotal] = useState(false);
  const [showVideo, setShowVideo] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const conversation = useConversation({
    onConnect: () => {
      console.log("connected");
    },
    onDisconnect: () => {
      console.log("disconnected");
      setRecognizedItems([]);
      setShowVideo(true);
      setHasSpokenTotal(false);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      }
    },
    onError: error => {
      console.error(error);
      alert("An error occurred during the conversation");
    },
    onMessage: message => {
      if (message.source !== "user" || !menu.length || !message.message) {
        return;
      }

      console.log("User message:", message.message);
      const msg = message.message.toLowerCase().replace(/[.,،?!]/g, " ");

      // Arabic numbers and words mapping for quantity
      const arabicNumbers: Record<string, number> = {
        "واحد": 1, "١": 1, "واحدة": 1,
        "اثنين": 2, "٢": 2, "اثنان": 2, "ثنين": 2, "تنين": 2, "اتنين": 2,
        "ثلاثة": 3, "٣": 3,
        "أربعة": 4, "٤": 4,
        "خمسة": 5, "٥": 5,
        "ستة": 6, "٦": 6,
        "سبعة": 7, "٧": 7,
        "ثمانية": 8, "٨": 8,
        "تسعة": 9, "٩": 9,
        "عشرة": 10, "١٠": 10,
      };

      // Unified quantity extraction function
      const extractQuantity = (str: string) => {
        const digitMatch = str.match(/\d+/);
        if (digitMatch) return parseInt(digitMatch[0]);

        const arabicDigitMatch = str.match(/[\u0660-\u0669]+/);
        if (arabicDigitMatch) {
          const converted = arabicDigitMatch[0].replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48));
          return parseInt(converted);
        }

        const wordMatch = str.match(/(واحد|واحدة|اثنين|اثنان|ثنين|تنين|اتنين|ثلاثة|أربعة|خمسة|ستة|سبعة|ثمانية|تسعة|عشرة)/i);
        if (wordMatch && arabicNumbers[wordMatch[0].toLowerCase()]) {
          return arabicNumbers[wordMatch[0].toLowerCase()];
        }
        
        return 1; // Default to 1 if no quantity is found
      };

      // Check for quantity-only updates first
      const isQtyUpdate = /(خليهم|خليها|خليه|خلي|خليهم يكونوا|خليهم يبقوا|يبقى|يكونوا)\s*(.+)/.test(msg);
      if (isQtyUpdate && recognizedItems.length > 0) {
        const newQtyStr = msg.match(/(خليهم|خليها|خليه|خلي|خليهم يكونوا|خليهم يبقوا|يبقى|يكونوا)\s*(.+)/)?.[2] || "";
        const qty = extractQuantity(newQtyStr);
        if (qty > 0) {
          const updated = [...recognizedItems];
          updated[updated.length - 1].quantity = qty;
          setRecognizedItems(updated);
          setShowVideo(false);
          setHasSpokenTotal(false);
          return;
        }
      }

      const recognized: { name: string; quantity: number }[] = [];
      const keywordsFound = new Set();

      // Algorithm 1: Direct Regex Pattern Matching
      menu.forEach(item => {
        const patterns = [item.name, item.arabic_name].filter(Boolean);
        patterns.forEach(pattern => {
          if (keywordsFound.has(item.name)) return;
          const escapedPattern = pattern.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(\\b\\d+|${Object.keys(arabicNumbers).join('|')})\\b\\s*(${escapedPattern})|(${escapedPattern})\\s*\\b(\\d+|${Object.keys(arabicNumbers).join('|')})\\b`, 'i');
          const match = msg.match(regex);
          if (match) {
            const qtyMatch = match[1] || match[4];
            const qty = qtyMatch ? extractQuantity(qtyMatch) : 1;
            recognized.push({ name: item.name, quantity: qty });
            keywordsFound.add(item.name);
          }
        });
      });

      // Algorithm 2: Keyword-Based Heuristic (Fallback)
      if (recognized.length === 0) {
        const msgWords = msg.split(/\s+/).filter(w => w.length > 1);
        menu.forEach(item => {
          if (keywordsFound.has(item.name)) return;
          const patterns = [item.name, item.arabic_name].filter(Boolean);
          patterns.forEach(pattern => {
            const itemWords = pattern.toLowerCase().split(/\s+/);
            const overlap = itemWords.filter(w => msgWords.includes(w)).length;
            if (overlap >= itemWords.length / 2) {
              const matchIndex = msgWords.findIndex(mw => itemWords.includes(mw));
              const context = msgWords.slice(Math.max(0, matchIndex - 3), Math.min(msgWords.length, matchIndex + 4)).join(" ");
              const qty = extractQuantity(context);
              recognized.push({ name: item.name, quantity: qty });
              keywordsFound.add(item.name);
            }
          });
        });
      }

      // Finalize and update order
      if (recognized.length > 0) {
        setRecognizedItems(prev => {
          const updated = [...prev];
          recognized.forEach(newItem => {
            const idx = updated.findIndex(i => i.name === newItem.name);
            if (idx !== -1) {
              updated[idx].quantity += newItem.quantity;
            } else {
              updated.push(newItem);
            }
          });
          return updated;
        });
        setHasSpokenTotal(false);
        setShowVideo(false);
      }

      // Speak total price logic
      if (
        message.message &&
        (/خليني احسبلك المجموع|المجموع/.test(message.message)) &&
        !hasSpokenTotal &&
        recognizedItems.length > 0
      ) {
        setHasSpokenTotal(true);
        setTimeout(() => {
          const totalPrice = recognizedItems.reduce((sum, item) => {
            const menuItem = menu.find(m => m.name === item.name);
            return sum + (menuItem ? parseFloat(menuItem.price_kwd) * item.quantity : 0);
          }, 0);
          const utter = new window.SpeechSynthesisUtterance(`المجموع ${totalPrice.toFixed(3)} كويت دينار`);
          window.speechSynthesis.speak(utter);
          fetch('/api/place-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: recognizedItems }),
          })
            .then(res => res.json())
            .then(data => console.log('Order placed:', data.success))
            .catch(err => console.error('Order placement failed:', err));
        }, 6000 + Math.floor(Math.random() * 2000));
      }
    },
  });

  useEffect(() => {
    fetchMenu().then(setMenu);
  }, []);

  const total = React.useMemo(() => {
    return recognizedItems.reduce((sum, item) => {
      const menuItem = menu.find(m => m.name === item.name);
      return sum + (menuItem ? parseFloat(menuItem.price_kwd) * item.quantity : 0);
    }, 0);
  }, [recognizedItems, menu]);

  const startConversation = useCallback(async () => {
    setHasStarted(true);
    setConnecting(true);
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      alert("No permission to use microphone");
      setConnecting(false);
      return;
    }
    const signedUrl = await getSignedUrl();
    await conversation.startSession({ signedUrl });
    setConnecting(false);
  }, [conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  return (
    <>
      <AnimatePresence>
        {showVideo && (
          <motion.video
            key="video"
            ref={videoRef}
            src={Math.random() < 0.5 ? "/caribou-animated-icon-gif-download-10411730.mp4" : "/large-thumbnail20250216-3097548-1djrrxq.mp4"}
            // src="/large-thumbnail20250216-3097548-1djrrxq.mp4"
            autoPlay
            loop
            muted
            className="fixed top-0 left-0 w-full h-5/6 rounded-3xl mb-24 object-contain -z-10"
            style={{ pointerEvents: "none" }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
          />
        )}
      </AnimatePresence>
      <div className="flex flex-col items-center gap-y-8 w-full h-full relative z-10">
        <AnimatePresence>
          {
          !showVideo && recognizedItems.length > 0 &&
           (
            <motion.div
              key="order"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40, transition: { duration: 0.6 } }}
              className="rounded-3xl w-full max-w-xl"
            >
              <p className="text-center">Your Order</p>
              <div>
                <ul className="flex flex-wrap gap-4 justify-center">
                  {recognizedItems.map(item => {
                    const menuItem = menu.find(m => m.name === item.name);
                    return (
                      <li key={item.name} className="flex flex-col items-center w-32 relative">
                        <div className="relative w-24 h-24 mb-2">
                          <span
                            className="absolute -top-2 -left-2 bg-blue-500 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold text-sm"
                            style={{ zIndex: 2 }}
                          >
                            {item.quantity}
                          </span>
                          <img
                            src={
                              item.name === "Chicken Club"
                                ? "/chicken club.jpeg"
                                : item.name === "Peach Mango Iced Tea"
                                ? "/Peach Mango Iced Tea.jpeg"
                                : item.name === "Strawberry Pineapple Iced Tea"
                                ? "/Strawberry Pineapple Iced Tea.webp"
                                : item.name === "Steak & Cheese"
                                ? "/Steak & Cheese.jpg"
                                : "/favicon.ico"
                            }
                            alt={item.name}
                            className="w-24 h-24 object-cover rounded-xl border"
                          />
                        </div>
                        <span className="font-semibold text-center">{item.name}</span>
                        <span className="text-sm text-gray-800">
                          {menuItem ? `${parseFloat(menuItem.price_kwd).toFixed(3)} KWD` : "-"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 font-bold text-lg text-center">
                  Total: {total.toFixed(3)} KWD
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* circle */}
        <div className="rounded-3xl fixed bottom-4 left-0 right-0 mx-auto w-fit z-50">
          <div className="flex flex-col gap-y-4 text-center">
            <div
              className={cn(
                "group orb my-4 mx-auto cursor-pointer transition-all",
                conversation.status === "connected" && conversation.isSpeaking
                  ? "orb-active animate-orb"
                  : conversation.status === "connected"
                  ? "animate-orb-slow orb-inactive"
                  : "orb-inactive"
              )}
              style={{ width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => {
                if (conversation.status === "connected") {
                  stopConversation();
                } else if (!connecting) {
                  startConversation();
                }
              }}
              title={
                conversation.status === "connected"
                  ? "End conversation"
                  : "Start conversation"
              }
            >
              {connecting && (
                <Loader className="animate-spin w-5 h-auto text-neutral-500" />
              )}
              {conversation.status !== "connected" && !connecting && (
                <Image
                  src="/voice.svg"
                  alt="Caribou Logo"
                  width={100}
                  height={100}
                  className={"w-6 h-auto"}
                />
              )}
              {conversation.status === "connected" && (
                <Square className="w-5 h-auto text-[#01bcd0ff] transition-all duration-300 group-hover:text-neutral-900" fill="currentColor" />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}