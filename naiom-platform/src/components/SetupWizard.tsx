"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

interface Key { name: string; label: string; required: boolean; help: string; url: string; placeholder: string; note?: string; set: boolean }

export function SetupWizard({ slug }: { slug: string }) {
  return null;
}
