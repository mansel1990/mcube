"use client";

import { useState } from "react";
import { WHATSAPP_COPY, WHATSAPP_DISPLAY, WHATSAPP_URL } from "./content";
import { WhatsAppIcon } from "./icons";

export function StudioContact() {
  const [copied, setCopied] = useState(false);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(WHATSAPP_COPY);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      const node = document.getElementById("waNum");
      if (!node) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  return (
    <section id="contact">
      <div className="wrap">
        <div className="contact">
          <div className="stack gap-16">
            <h2>Which part of your week would you pay to get back?</h2>
            <p className="muted contact-note">
              Send Mithila a WhatsApp message describing the manual process. She reads and replies to every message herself.
            </p>
          </div>
          <div className="stack gap-14">
            <a className="btn btn-wa" href={WHATSAPP_URL} target="_blank" rel="noopener">
              <WhatsAppIcon />
              Message us on WhatsApp
            </a>
            <div className="num">
              <span id="waNum">{WHATSAPP_DISPLAY}</span>
              <button className="copy" type="button" onClick={copyNumber}>
                {copied ? "Copied" : "Copy number"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
