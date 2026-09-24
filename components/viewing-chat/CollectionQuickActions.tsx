"use client";

import {
  QuickActionChip,
  QuickActionRow,
} from "@/components/viewing-chat/QuickActionChip";

export function CollectionQuickActions({
  labels,
  disabled,
  onPasteUrl,
  onUploadPhoto,
  onUploadScreenshot,
  onUploadHoaDoc,
  onPasteText,
  onSkip,
}: {
  labels: {
    pasteUrl: string;
    uploadPhoto: string;
    uploadScreenshot: string;
    uploadHoaDoc: string;
    pasteText: string;
    skip: string;
  };
  disabled?: boolean;
  onPasteUrl: () => void;
  onUploadPhoto: () => void;
  onUploadScreenshot: () => void;
  onUploadHoaDoc: () => void;
  onPasteText: () => void;
  onSkip: () => void;
}) {
  const chips: { key: string; label: string; onClick: () => void }[] = [
    { key: "url", label: labels.pasteUrl, onClick: onPasteUrl },
    { key: "photo", label: labels.uploadPhoto, onClick: onUploadPhoto },
    {
      key: "screenshot",
      label: labels.uploadScreenshot,
      onClick: onUploadScreenshot,
    },
    { key: "hoa", label: labels.uploadHoaDoc, onClick: onUploadHoaDoc },
    { key: "text", label: labels.pasteText, onClick: onPasteText },
    { key: "skip", label: labels.skip, onClick: onSkip },
  ];

  return (
    <QuickActionRow>
      {chips.map((chip) => (
        <QuickActionChip key={chip.key} disabled={disabled} onClick={chip.onClick}>
          {chip.label}
        </QuickActionChip>
      ))}
    </QuickActionRow>
  );
}
