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
  const [menu, setMenu] = useState<{ name: string; price_kwd: string }[]>([]);
  const [order, setOrder] = useState<{ name: string; quantity: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [spokenPrice, setSpokenPrice] = useState<string | null>(null); // 👈 new state

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
      const priceMatch = message.text?.match(/(\d+(\.\d{1,3})?)\s?KWD/i);
      if (priceMatch) {
        setSpokenPrice(`${parseFloat(priceMatch[1]).toFixed(3)} KWD`);
      }
    },
  });

  useEffect(() => {
    fetchMenu().then(setMenu);
  }, []);

  // Calculate total whenever order changes
  useEffect(() => {
    let sum = 0;
    for (const item of order) {
      const menuItem = menu.find(m => m.name === item.name);
      if (menuItem) {
        sum += parseFloat(menuItem.price_kwd) * item.quantity;
      }
    }
    setTotal(sum);
  }, [order, menu]);

  const addToOrder = (name: string) => {
    setOrder(prev => {
      const existing = prev.find(i => i.name === name);
      if (existing) {
        return prev.map(i =>
          i.name === name ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { name, quantity: 1 }];
    });
  };

  const removeFromOrder = (name: string) => {
    setOrder(prev =>
      prev
        .map(i =>
          i.name === name ? { ...i, quantity: i.quantity - 1 } : i
        )
        .filter(i => i.quantity > 0)
    );
  };

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
      {/* Menu */}
      <Card className="rounded-3xl w-full max-w-xl">
        <CardHeader>
          <CardTitle className="text-center">Caribou Coffee Menu</CardTitle>
        </CardHeader>
        <CardContent>
          <ul>
            {menu.map(item => (
              <li
                key={item.name}
                className="flex justify-between items-center py-2"
              >
                <span>{item.name}</span>
                <span>{parseFloat(item.price_kwd).toFixed(3)} KWD</span>
                <Button size="sm" onClick={() => addToOrder(item.name)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Order */}
      <Card className="rounded-3xl w-full max-w-xl">
        <CardHeader>
          <CardTitle className="text-center">Your Order</CardTitle>
        </CardHeader>
        <CardContent>
          {order.length === 0 ? (
            <div>No items selected.</div>
          ) : (
            <ul>
              {order.map(item => (
                <li
                  key={item.name}
                  className="flex justify-between items-center py-2"
                >
                  <span>
                    {item.name} x {item.quantity}
                  </span>
                  <Button size="sm" onClick={() => removeFromOrder(item.name)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 font-bold text-lg">
            Total: {total.toFixed(3)} KWD
          </div>
        </CardContent>
      </Card>

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
