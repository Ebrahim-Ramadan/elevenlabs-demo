"use client";

import { Button } from "@/components/ui/button";
import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConversation } from "@11labs/react";
import { cn } from "@/lib/utils";
import { Loader, Loader2, XIcon } from "lucide-react"; // Add this at the top if you use lucide icons
import { BackgroundWave } from "./background-wave";

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

      function extractQty(str: string) {
        // Try to find Arabic word or digit
        for (const [word, num] of Object.entries(arabicNumbers)) {
          if (str.includes(word)) return num;
        }
        // Try to find digit (English or Arabic)
        const digitMatch = str.match(/(\d+)/);
        if (digitMatch) return parseInt(digitMatch[1]);
        return 1;
      }

      // Smart extraction: always scan for menu items in every agent message
      if (menu.length > 0 && message.message) {
        const recognized: { name: string; quantity: number }[] = [];
        menu.forEach(item => {
          const patterns = [item.name, item.arabic_name].filter(Boolean);
          patterns.forEach(pattern => {
            // Match phrases like "2 Chicken Club", "Chicken Club 2", "أربع Chicken Club", "Chicken Club أربع"
            const regex = new RegExp(
              `(?:([\\d\u0660-\u0669]+)\\s*)?${pattern.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?:\\s*([\\d\u0660-\u0669]+))?`,
              "gi"
            );
            let match;
            let totalQty = 0;
            while ((match = regex.exec(message.message)) !== null) {
              // Prefer quantity before, else after, else default to 1
              let qty = 1;
              if (match[1]) qty = parseInt(match[1].replace(/[\u0660-\u0669]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48)));
              else if (match[2]) qty = parseInt(match[2].replace(/[\u0660-\u0669]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48)));
              totalQty += isNaN(qty) ? 1 : qty;
            }
            if (totalQty > 0) {
              // Avoid duplicates
              if (!recognized.some(r => r.name === item.name)) {
                recognized.push({ name: item.name, quantity: totalQty });
              }
            }
          });
        });

        if (recognized.length > 0) {
          setRecognizedItems(recognized);
          setHasSpokenTotal(false); // Reset for new order
          setShowVideo(false); // Hide video when order detected
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
    {showVideo && (
        <video
          ref={videoRef}
          src="/large-thumbnail20250216-3097548-1djrrxq.mp4"
          autoPlay
          loop
          muted
          className="fixed top-0 left-0 w-full h-5/6 rounded-3xl mb-24 object-contain -z-10"
          style={{ pointerEvents: "none" }}
        />
      )}
    <div className="flex flex-col items-center gap-y-8 w-full h-full">
      {/* Initial Video */}
      

      {/* Your Order (agent detected) */}
      {showVideo && recognizedItems.length <= 0 && (
        <div className="rounded-3xl w-full max-w-xl">
                     <p className="text-center">Your Order</p>

          <div>
            <ul className="flex flex-wrap gap-4 justify-center">
              {recognizedItems.map(item => {
                const menuItem = menu.find(m => m.name === item.name);
                const slug = item.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
                const imgSrcJpg = `/` + slug + `.jpg`;
                const imgSrcPng = `/` + slug + `.png`;
                return (
                  <li key={item.name} className="flex flex-col items-center w-32 relative">
                    <div className="relative w-24 h-24 mb-2">
                      {/* Quantity badge */}
                      <span
                        className="absolute -top-2 -left-2 bg-blue-500 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold text-sm shadow"
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
        </div>
      )}

      {/* Conversation Orb */}
      <div className="rounded-3xl fixed bottom-4 left-0 right-0 mx-auto w-fit z-50">
        <div className="flex flex-col gap-y-4 text-center">
          <div
            className={cn(
              "orb my-4 mx-auto cursor-pointer transition-all",
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
            {connecting ? (
              <Loader className="animate-spin w-6 h-auto text-neutral-500" />
            ) : null}
            {conversation.status === "connected" ? (
              <XIcon className="w-6 h-auto text-red-900" />
            ) : null}
          </div>
        </div>
        <p className="flex justify-center text-xs md:text-sm">
          {connecting
            ?   "..."
            : conversation.status === "connected"
            ? conversation.isSpeaking
              ? "Agent is speaking"
              : "Agent is listening"
            : "Disconnected"}
        </p>
      </div>
    </div>
      </>

  );

}
