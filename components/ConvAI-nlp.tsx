"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useConversation } from "@11labs/react";
import { cn } from "@/lib/utils";
import { Loader, Square } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import nlp from "compromise";

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

export function ConvAINLP() {
  const [connecting, setConnecting] = useState(false);
  const [menu, setMenu] = useState<{ name: string; price_kwd: string; arabic_name: string }[]>([]);
  const [spokenPrice, setSpokenPrice] = useState<string | null>(null);
  const [recognizedItems, setRecognizedItems] = useState<{ name: string; quantity: number }[]>([]);
  const [hasSpokenTotal, setHasSpokenTotal] = useState(false);
  const [showVideo, setShowVideo] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize Compromise with custom rules
  useEffect(() => {
    const nlpPlugin = {
      tags: {
        Item: { isA: "Noun" },
        Quantity: { isA: "Value" },
      },
      words: {},
      patterns: {},
    };

    // Add menu items as custom words
    menu.forEach(item => {
      nlpPlugin.words[item.name.toLowerCase()] = "Item";
      if (item.arabic_name) {
        nlpPlugin.words[item.arabic_name.toLowerCase()] = "Item";
      }
    });

    // Add Arabic numbers as quantities
    const arabicNumbers: Record<string, number> = {
      واحد: 1, "١": 1, اثنين: 2, "٢": 2, ثلاثة: 3, "٣": 3, أربعة: 4, "٤": 4,
      خمسة: 5, "٥": 5, ستة: 6, "٦": 6, سبعة: 7, "٧": 7, ثمانية: 8, "٨": 8,
      تسعة: 9, "٩": 9, عشرة: 10, "١٠": 10, تنين: 2, اثنان: 2, ثنين: 2,
    };
    Object.keys(arabicNumbers).forEach(word => {
      nlpPlugin.words[word] = "Quantity";
    });

    // Add patterns for quantities (digits)
    nlpPlugin.patterns["[0-9]+"] = "Quantity";
    nlpPlugin.patterns["[\u0660-\u0669]+"] = "Quantity"; // Arabic digits

    nlp.extend(nlpPlugin);
  }, [menu]);

  const conversation = useConversation({
    onConnect: () => console.log("connected"),
    onDisconnect: () => {
      console.log("disconnected");
      setRecognizedItems([]);
      setShowVideo(true);
      setSpokenPrice(null);
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
    onMessage: async message => {
      console.log("Message:", message);

      if (message.source === "user") {
        console.log("User message:", message.message);

        // Extract price
        const priceMatch = message.message?.match(/(\d+(\.\d{1,3})?)\s?KWD/i);
        if (priceMatch) {
          setSpokenPrice(`${parseFloat(priceMatch[1]).toFixed(3)} KWD`);
        }

        // Normalize text
        const tokens = message.message.replace(/[.,،؟!]/g, " ").split(/\s+/).filter(w => w.length > 0);
        const normalizedText = tokens.join(" ").toLowerCase();

        // Build a lookup for menu items (both English and Arabic)
        const menuLookup: Record<string, string> = {};
        menu.forEach(item => {
          menuLookup[item.name.toLowerCase()] = item.name;
          if (item.arabic_name) {
            menuLookup[item.arabic_name.toLowerCase()] = item.name;
          }
        });

        // Arabic numbers mapping
        const arabicNumbers: Record<string, number> = {
          واحد: 1, "١": 1, اثنين: 2, "٢": 2, ثلاثة: 3, "٣": 3, أربعة: 4, "٤": 4,
          خمسة: 5, "٥": 5, ستة: 6, "٦": 6, سبعة: 7, "٧": 7, ثمانية: 8, "٨": 8,
          تسعة: 9, "٩": 9, عشرة: 10, "١٠": 10, تنين: 2, اثنان: 2, ثنين: 2,
        };

        // Regex to match (quantity) (item) pairs, e.g. "2 Chicken Club" or "اثنين Chicken Club"
        const itemPatterns = Object.keys(menuLookup)
          .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("|");
        const quantityPatterns = Object.keys(arabicNumbers).join("|") + "|[0-9]+|[\u0660-\u0669]+";
        const pairRegex = new RegExp(`(?:(${quantityPatterns})\\s*)?(${itemPatterns})`, "gi");

        const recognized: { name: string; quantity: number }[] = [];
        let match;
        while ((match = pairRegex.exec(normalizedText)) !== null) {
          let qty = 1;
          const qtyRaw = match[1];
          if (qtyRaw) {
            if (/^[\u0660-\u0669]+$/.test(qtyRaw)) {
              // Arabic digits
              qty = Number(qtyRaw.replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48)));
            } else if (/^\d+$/.test(qtyRaw)) {
              qty = Number(qtyRaw);
            } else {
              qty = arabicNumbers[qtyRaw] || 1;
            }
          }
          const itemKey = match[2].toLowerCase();
          const itemName = menuLookup[itemKey];
          if (itemName) {
            const existingIdx = recognized.findIndex(r => r.name === itemName);
            if (existingIdx !== -1) {
              recognized[existingIdx].quantity += qty;
            } else {
              recognized.push({ name: itemName, quantity: qty });
            }
          }
        }

        // Fallback: If no pairs found, try to detect single items
        if (recognized.length === 0) {
          Object.keys(menuLookup).forEach(itemKey => {
            if (normalizedText.includes(itemKey)) {
              recognized.push({ name: menuLookup[itemKey], quantity: 1 });
            }
          });
        }

        // Update recognized items
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
          console.log("Order detected:", recognized);
        }
      } else if (message.source === "ai") {
        if (
          message.message &&
          /خليني احسبلك المجموع|المجموع/.test(message.message) &&
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

            fetch("/api/place-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: recognizedItems }),
            })
              .then(res => res.json())
              .then(data => {
                if (data.success) {
                  console.log("Order placed and quantity_sold updated!");
                } else {
                  console.error("Order placement error:", data.error);
                }
              })
              .catch(err => {
                console.error("Order placement failed:", err);
              });
          }, 6000 + Math.floor(Math.random() * 2000));
        }
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

  async function startConversation() {
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
  }

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  return (
    <>
      <AnimatePresence>
        {/* {showVideo && (
          <motion.video
            key="video"
            ref={videoRef}
            src="/large-thumbnail20250216-3097548-1djrrxq.mp4"
            autoPlay
            loop
            muted
            className="fixed top-0 left-0 w-full h-5/6 rounded-3xl mb-24 object-contain -z-10"
            style={{ pointerEvents: "none" }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
          />
        )} */}
      </AnimatePresence>
      <div className="flex flex-col items-center gap-y-8 w-full h-full relative z-10">
        <AnimatePresence>
          {recognizedItems.length > 0 && (
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
              style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => {
                if (conversation.status === "connected") {
                  stopConversation();
                } else if (!connecting) {
                  startConversation();
                }
              }}
              title={conversation.status === "connected" ? "End conversation" : "Start conversation"}
            >
              {connecting && <Loader className="animate-spin w-5 h-auto text-neutral-500" />}
              {conversation.status !== "connected" && !connecting && (
                <Image
                  src="/voice.svg"
                  alt="Caribou Logo"
                  width={100}
                  height={100}
                  className="w-5 h-auto"
                />
              )}
              {conversation.status === "connected" && (
                <Square
                  className="w-5 h-auto text-neutral-600 transition-all duration-300 group-hover:text-neutral-900"
                  fill="currentColor"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}