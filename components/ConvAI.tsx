"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useConversation } from "@11labs/react";
import { cn } from "@/lib/utils";
import { Loader,  Square } from "lucide-react"; // Add this at the top if you use lucide icons
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
  // Remove manual order state, use only recognizedItems
  const [spokenPrice, setSpokenPrice] = useState<string | null>(null);
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
      setSpokenPrice(null);
      setHasSpokenTotal(false);
      // Optionally restart video
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
      console.log("Agent message:", message);
      // Check if the message is from the user or agent
      if (message.source === "user") {
        console.log("User message:", message.message);
        // Handle user message (e.g., display in UI or log differently)

        // Run order detection, quantity extraction, etc. here
        // Extract price like "1.250 KWD"
        const priceMatch = message.message?.match(/(\d+(\.\d{1,3})?)\s?KWD/i);
        if (priceMatch) {
          setSpokenPrice(`${parseFloat(priceMatch[1]).toFixed(3)} KWD`);
        }

        // Arabic numbers and words mapping
        const arabicNumbers: Record<string, number> = {
          "واحد": 1, "١": 1,
          "اثنين": 2, "٢": 2,
          "ثلاثة": 3, "٣": 3,
          "أربعة": 4, "٤": 4,
          "خمسة": 5, "٥": 5,
          "ستة": 6, "٦": 6,
          "سبعة": 7, "٧": 7,
          "ثمانية": 8, "٨": 8,
          "تسعة": 9, "٩": 9,
          "عشرة": 10, "١٠": 10,
        };

        if (menu.length > 0 && message.message) {
          const recognized: { name: string; quantity: number }[] = [];
          const msg = message.message.replace(/[.,،؟!]/g, " ");

          // Helper: extract quantity from message
          function extractQty(str: string) {
            const digitMatch = str.match(/\d+/);
            const arabicDigitMatch = str.match(/[\u0660-\u0669]+/);
            const twoWords = [
              "اتنين", "اثنين", "اثنان", "ثنين", "تنين",
              "اتنينه", "اثنينه", "اثنينات", "ثنينات",
              "اثنينات", "اتنينات", "اتنينات", "اتنينين", "اثنينين",
              "اتنين يا", "اثنين يا", "ثنين يا", "تنين يا"
            ];
            let qty = 0;
            if (digitMatch) qty += parseInt(digitMatch[0]);
            if (arabicDigitMatch) {
              const converted = arabicDigitMatch[0].replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48));
              qty += parseInt(converted);
            }
            twoWords.forEach(w => {
              if (str.includes(w)) qty += 2;
            });
            return qty;
          }

          // Check if message is just a quantity update (e.g. "خليهم اتنين")
          const isQtyUpdate = /(خليهم|خليها|خليه|خلي|خليهم يكونوا|خليهم يبقوا|يبقى|يكونوا)\s*(\d+|[\u0660-\u0669]+|اتنين|اثنين|اثنان|ثنين|تنين)/.test(msg);

          if (isQtyUpdate && recognizedItems.length > 0) {
            // Update last item's quantity
            const qty = extractQty(msg);
            if (qty > 0) {
              const updated = [...recognizedItems];
              updated[updated.length - 1].quantity = qty;
              setRecognizedItems(updated);
              setHasSpokenTotal(false);
              setShowVideo(false);
              console.log("Order updated:", updated);
              return;
            }
          }
// ...inside onMessage...
menu.forEach(item => {
  const patterns = [item.name, item.arabic_name].filter(Boolean);
  patterns.forEach(pattern => {
    const itemWords = pattern.split(/\s+/).filter(w => w.length > 1);
    const msgWords = msg.split(/\s+/).filter(w => w.length > 1);

    // Find the best match index in the message
    const matchIndex = msgWords.findIndex(mw =>
      itemWords.some(iw => mw.includes(iw) || iw.includes(mw))
    );
    if (matchIndex !== -1) {
      // Look for quantity ONLY in the 2 words before the match
      let qty = 1;
      const contextBefore = msgWords.slice(Math.max(0, matchIndex - 2), matchIndex).join(" ");
      const contextAfter = msgWords.slice(matchIndex + 1, matchIndex + 3).join(" ");
      const digitMatchBefore = contextBefore.match(/\d+/);
      const digitMatchAfter = contextAfter.match(/\d+/);
      const arabicDigitMatchBefore = contextBefore.match(/[\u0660-\u0669]+/);
      const arabicDigitMatchAfter = contextAfter.match(/[\u0660-\u0669]+/);
      const twoWords = [
        "اتنين", "اثنين", "اثنان", "ثنين", "تنين",
        "اتنينه", "اثنينه", "اثنينات", "ثنينات",
        "اثنينات", "اتنينات", "اتنينات", "اتنينين", "اثنينين",
        "اتنين يا", "اثنين يا", "ثنين يا", "تنين يا"
      ];

      // Priority: before > after > default
      if (digitMatchBefore) qty = parseInt(digitMatchBefore[0]);
      else if (arabicDigitMatchBefore) {
        const converted = arabicDigitMatchBefore[0].replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48));
        qty = parseInt(converted);
      } else if (twoWords.some(w => contextBefore.includes(w))) {
        qty = 2;
      } else if (digitMatchAfter) qty = parseInt(digitMatchAfter[0]);
      else if (arabicDigitMatchAfter) {
        const converted = arabicDigitMatchAfter[0].replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 48));
        qty = parseInt(converted);
      } else if (twoWords.some(w => contextAfter.includes(w))) {
        qty = 2;
      }

      if (!recognized.some(r => r.name === item.name)) {
        recognized.push({ name: item.name, quantity: qty });
      }
    }
  });
});

          // Prefer best match if multiple
          if (recognized.length > 1) {
            recognized.sort((a, b) => {
              const aWords = a.name.toLowerCase().split(/\s+/);
              const bWords = b.name.toLowerCase().split(/\s+/);
              const msgWords = msg.toLowerCase().split(/\s+/);
              const aOverlap = aWords.filter(w => msgWords.includes(w)).length;
              const bOverlap = bWords.filter(w => msgWords.includes(w)).length;
              return bOverlap - aOverlap;
            });
            recognized.splice(1);
          }

          // ...inside onMessage, after recognized is filled...
if (recognized.length > 0) {
  setRecognizedItems(prev => {
    // Create a copy of previous items
    const updated = [...prev];
    recognized.forEach(newItem => {
      const idx = updated.findIndex(i => i.name === newItem.name);
      if (idx !== -1) {
        // If item exists, add to its quantity
        updated[idx].quantity += newItem.quantity;
      } else {
        // If new, add it
        updated.push(newItem);
      }
    });
    return updated;
  });
  setHasSpokenTotal(false);
  setShowVideo(false);
  console.log("Order detected:", recognized);
}
        }

        // Speak total price if agent says 'خليني احسبلك المجموع' or 'المجموع' (only first time)
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

            // Send order to backend
            fetch('/api/place-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: recognizedItems }),
            })
              .then(res => res.json())
              .then(data => {
                if (data.success) {
                  console.log('Order placed and quantity_sold updated!');
                } else {
                  console.error('Order placement error:', data.error);
                }
              })
              .catch(err => {
                console.error('Order placement failed:', err);
              });
          }, 6000 + Math.floor(Math.random() * 2000)); // 6-8 seconds
        }
      } else if (message.source === "ai") {
        // Agent message can be used for UI, but not for order detection
      }
    },
  });

  useEffect(() => {
    fetchMenu().then(setMenu);
  }, []);

  // Calculate total whenever recognizedItems changes
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
        {showVideo && (
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
        )}
      </AnimatePresence>
      <div className="flex flex-col items-center gap-y-8 w-full h-full relative z-10">
        <AnimatePresence>
          {
          !showVideo && 
          recognizedItems.length > 0
           && (
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
                            className="absolute -top-2 -left-2 bg-blue-500 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold text-sm "
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

      {/* Conversation Orb */}
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
            title={
              conversation.status === "connected"
                ? "End conversation"
                : "Start conversation"
            }
          >
            {connecting && (
              <Loader className="animate-spin w-5 h-auto text-neutral-500" />
            ) }
            {conversation.status != "connected" && !connecting&& (
              <Image
                src="/voice.svg"
                alt="Caribou Logo"
                width={100}
                height={100}
                className={"w-5 h-auto "}
              />
            ) }
            {conversation.status === "connected" && (
              <Square className="w-5 h-auto text-neutral-600 transition-all duration-300 group-hover:text-neutral-900" fill="currentColor" />
            )}
          </div>
        </div>
        {/* <p className="flex justify-center text-xs md:text-sm">
          {connecting
            ? "..."
            : conversation.status === "connected"
            ? conversation.isSpeaking
              ? "Agent is speaking"
              : "Agent is listening"
            : hasStarted
            ? "Disconnected"
            : ""}
        </p> */}
      </div>
    </div>
      </>

  );

}
