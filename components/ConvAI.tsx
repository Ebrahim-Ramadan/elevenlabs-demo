"use client";

import { Button } from "@/components/ui/button";
import * as React from "react";
import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConversation } from "@11labs/react";
import { cn } from "@/lib/utils";

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
  // Test function to send order to backend
  function testPlaceOrder() {
    if (recognizedItems.length > 0) {
      fetch('/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: recognizedItems }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            alert('Order placed and quantity_sold updated!');
          } else {
            alert('Order placement error: ' + data.error);
          }
        })
        .catch(err => {
          alert('Order placement failed: ' + err);
        });
    } else {
      alert('No items to place order.');
    }
  }
  const [menu, setMenu] = useState<{ name: string; price_kwd: string, arabic_name: string }[]>([]);
  // Remove manual order state, use only recognizedItems
  const [spokenPrice, setSpokenPrice] = useState<string | null>(null);
  const [recognizedItems, setRecognizedItems] = useState<{ name: string; quantity: number }[]>([]);
  const [hasSpokenTotal, setHasSpokenTotal] = useState(false);

  const conversation = useConversation({
    onConnect: () => {
      console.log("connected");
    },
    onDisconnect: () => {
      console.log("disconnected");
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
            // Flexible regex: match quantity before or after item, Arabic or English
            const regex = new RegExp(
              `(?:(${Object.keys(arabicNumbers).join("|")}|\\d+)\\s*)?${pattern.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?:\\s*(${Object.keys(arabicNumbers).join("|")}|\\d+))?`,
              "gi"
            );
            let match;
            let totalQty = 0;
            while ((match = regex.exec(message.message)) !== null) {
              // Prefer quantity before, else after, else default to 1
              let qty = 1;
              if (match[1]) qty = extractQty(match[1]);
              else if (match[2]) qty = extractQty(match[2]);
              totalQty += qty;
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
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      alert("No permission to use microphone");
      return;
    }
    const signedUrl = await getSignedUrl();
    const conversationId = await conversation.startSession({ signedUrl });
    console.log("Conversation started:", conversationId);
  }

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  return (
    <div className="flex flex-col items-center gap-y-8">
      {/* <Button
        variant="outline"
        className="mb-4"
        onClick={testPlaceOrder}
      >
        Test Place Order
      </Button> */}
      {/* Your Order (agent detected) */}
      <Card className="rounded-3xl w-full max-w-xl">
        <CardHeader>
          <CardTitle className="text-center">Your Order</CardTitle>
        </CardHeader>
        <CardContent>
          {recognizedItems.length === 0 ? (
            <div>No items detected.</div>
          ) : (
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
                        src={imgSrcJpg}
                        alt={item.name}
                        onError={e => {
                          (e.target as HTMLImageElement).src = imgSrcPng;
                          (e.target as HTMLImageElement).onerror = () => {
                            (e.target as HTMLImageElement).src = "/favicon.ico";
                          };
                        }}
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
          )}
          <div className="mt-4 font-bold text-lg text-center">
            Total: {total.toFixed(3)} KWD
          </div>
        </CardContent>
      </Card>


      {/* Recognized Items from Agent (with images) */}
      {recognizedItems.length > 0 && (
        <Card className="rounded-3xl w-full max-w-xl bg-blue-50 border-blue-300">
          <CardHeader>
            <CardTitle className="text-center text-blue-700">
              Agent Recognized Order
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-4 justify-center">
              {recognizedItems.map(item => {
                const menuItem = menu.find(m => m.name === item.name);
                // Try to get image src (assume jpg/png by slugifying name)
                const slug = item.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
                const imgSrcJpg = `/` + slug + `.jpg`;
                const imgSrcPng = `/` + slug + `.png`;
                // Use jpg by default, fallback to png, fallback to placeholder
                return (
                  <li key={item.name} className="flex flex-col items-center w-32">
                    <img
                      src={imgSrcJpg}
                      alt={item.name}
                      onError={e => {
                        (e.target as HTMLImageElement).src = imgSrcPng;
                        (e.target as HTMLImageElement).onerror = () => {
                          (e.target as HTMLImageElement).src = "/favicon.ico";
                        };
                      }}
                      className="w-24 h-24 object-cover rounded-xl border mb-2"
                    />
                    <span className="font-semibold text-center">{item.name}</span>
                    <span className="text-sm text-gray-600">x {item.quantity}</span>
                    <span className="text-sm text-gray-800">
                      {menuItem ? `${parseFloat(menuItem.price_kwd).toFixed(3)} KWD` : "-"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 font-bold text-lg text-center">
              Total: {
                recognizedItems.reduce((sum, item) => {
                  const menuItem = menu.find(m => m.name === item.name);
                  return sum + (menuItem ? parseFloat(menuItem.price_kwd) * item.quantity : 0);
                }, 0).toFixed(3)
              } KWD
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spoken Price from Agent */}
      {spokenPrice && (
        <Card className="rounded-3xl w-full max-w-xl bg-yellow-50 border-yellow-300">
          <CardHeader>
            <CardTitle className="text-center text-yellow-700">
              Agent Quoted Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center font-bold text-xl">{spokenPrice}</div>
          </CardContent>
        </Card>
      )}

      {/* Conversation Orb */}
      <Card className="rounded-3xl">
        <CardContent>
          <CardHeader>
            <CardTitle className="text-center">
              {conversation.status === "connected"
                ? conversation.isSpeaking
                  ? "Agent is speaking"
                  : "Agent is listening"
                : "Disconnected"}
            </CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-y-4 text-center">
            <div
              className={cn(
                "orb my-16 mx-12",
                conversation.status === "connected" && conversation.isSpeaking
                  ? "orb-active animate-orb"
                  : conversation.status === "connected"
                  ? "animate-orb-slow orb-inactive"
                  : "orb-inactive"
              )}
            ></div>

            <Button
              variant="outline"
              className="rounded-full"
              size="lg"
              disabled={
                conversation !== null && conversation.status === "connected"
              }
              onClick={startConversation}
            >
              Start conversation
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              size="lg"
              disabled={conversation === null}
              onClick={stopConversation}
            >
              End conversation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
