"use client";

import {
  Document,
  Font,
  Image as PdfImage,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { formatPdfDate, type PdfDocumentLabels, type PdfSummaryModel } from "@/lib/pdf-export";

Font.register({
  family: "NotoSansTC",
  fonts: [
    { src: "/fonts/NotoSansTC-Regular.otf", fontWeight: 400 },
    { src: "/fonts/NotoSansTC-Bold.otf", fontWeight: 700 },
  ],
});

Font.register({
  family: "NotoSansThai",
  fonts: [
    { src: "/fonts/NotoSansThai-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/NotoSansThai-Bold.ttf", fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingHorizontal: 38,
    paddingBottom: 52,
    fontSize: 9.5,
    lineHeight: 1.5,
    color: "#1A1A1A",
  },
  header: {
    backgroundColor: "#111111",
    color: "#FFFFFF",
    borderRadius: 12,
    padding: 18,
    marginBottom: 14,
  },
  eyebrow: { fontSize: 8, opacity: 0.68, letterSpacing: 1.4 },
  address: { fontSize: 17, fontWeight: 700, marginTop: 6, lineHeight: 1.3 },
  date: { fontSize: 9, marginTop: 7, opacity: 0.82 },
  section: {
    border: "1 solid #E7E2DD",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  goodSection: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  riskSection: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginBottom: 7 },
  factsGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  fact: { width: "33.333%", paddingHorizontal: 4, marginBottom: 7 },
  factWide: { width: "100%", paddingHorizontal: 4, marginBottom: 7 },
  label: { fontSize: 7.5, color: "#6B7280", marginBottom: 2 },
  value: { fontSize: 9.5, fontWeight: 700 },
  listItem: { flexDirection: "row", marginBottom: 5 },
  bullet: { width: 12, fontWeight: 700 },
  listText: { flexGrow: 1, flexBasis: 0 },
  rating: { fontSize: 18, fontWeight: 700 },
  ratingSuffix: { fontSize: 9, color: "#6B7280" },
  photoBlock: {
    border: "1 solid #E7E2DD",
    borderRadius: 9,
    padding: 8,
    marginBottom: 9,
  },
  photo: { width: "100%", height: 235, objectFit: "contain", backgroundColor: "#F5F3F0" },
  photoTag: { fontSize: 9, fontWeight: 700, marginTop: 6 },
  photoNote: { fontSize: 8.5, color: "#4B5563", marginTop: 3 },
  link: { color: "#2563EB", textDecoration: "underline", fontSize: 8.5 },
  disclaimer: {
    fontSize: 8,
    color: "#6B7280",
    borderTop: "1 solid #E7E2DD",
    paddingTop: 8,
    marginTop: 2,
  },
  generatedAt: { fontSize: 7.5, color: "#9CA3AF", marginTop: 6 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 38,
    right: 38,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#9CA3AF",
  },
  empty: { color: "#9CA3AF", fontSize: 8.5 },
});

type TextItem = { id: string; text: string };

function ListSection({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: TextItem[];
  empty: string;
  tone?: "good" | "risk";
}) {
  return (
    <View
      style={[
        styles.section,
        tone === "good" ? styles.goodSection : {},
        tone === "risk" ? styles.riskSection : {},
      ]}
    >
      <Text style={styles.sectionTitle} minPresenceAhead={24}>
        {title}
      </Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>{empty}</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.listItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.listText} orphans={2} widows={2}>
              {item.text}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

export function ViewingSummaryPdfDocument({
  model,
  labels,
  locale,
  fontFamilyOverride,
}: {
  model: PdfSummaryModel;
  labels: PdfDocumentLabels;
  locale: string;
  /** Standard font used only by renderer smoke tests. */
  fontFamilyOverride?: string;
}) {
  const { snapshot, photos } = model;
  const fontFamily =
    fontFamilyOverride || (locale.startsWith("th") ? "NotoSansThai" : "NotoSansTC");
  const generatedDate = new Date(snapshot.generatedAt);
  const creationDate = Number.isNaN(generatedDate.getTime())
    ? new Date(0)
    : generatedDate;
  const facts = [
    [labels.layout, snapshot.layoutLabel],
    [labels.price, snapshot.priceLabel],
    [labels.unit, snapshot.unitLabel],
    [labels.area, snapshot.areaLabel],
    [labels.managementFee, snapshot.managementFeeLabel],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <Document
      title={`${labels.title} - ${snapshot.address}`}
      author="KanFangJi"
      subject={labels.title}
      creator="KanFangJi"
      creationDate={creationDate}
    >
      <Page size="A4" wrap style={[styles.page, { fontFamily }]}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{labels.title}</Text>
          <Text style={styles.address}>{snapshot.address || labels.emptySection}</Text>
          <Text style={styles.date}>
            {labels.viewingAt}:{" "}
            {formatPdfDate(snapshot.viewingAt, locale) || labels.emptySection}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} minPresenceAhead={28}>
            {labels.basics}
          </Text>
          {facts.length === 0 &&
          !snapshot.listingUrl &&
          !snapshot.setupNotes ? (
            <Text style={styles.empty}>{labels.emptySection}</Text>
          ) : (
            <View style={styles.factsGrid}>
              {facts.map(([label, value]) => (
                <View key={label} style={styles.fact} wrap={false}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.value}>{value}</Text>
                </View>
              ))}
              {snapshot.listingUrl ? (
                <View style={styles.factWide}>
                  <Text style={styles.label}>{labels.listingUrl}</Text>
                  <Link src={snapshot.listingUrl} style={styles.link}>
                    {snapshot.listingUrl}
                  </Link>
                </View>
              ) : null}
              {snapshot.setupNotes ? (
                <View style={styles.factWide}>
                  <Text style={styles.label}>{labels.setupNotes}</Text>
                  <Text orphans={2} widows={2}>
                    {snapshot.setupNotes}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>{labels.rating}</Text>
          {snapshot.overallRating == null ? (
            <Text style={styles.empty}>{labels.ratingEmpty}</Text>
          ) : (
            <Text style={styles.rating}>
              {snapshot.overallRating}
              <Text style={styles.ratingSuffix}> / 5</Text>
            </Text>
          )}
        </View>

        <ListSection title={labels.pros} items={snapshot.pros} empty={labels.emptySection} tone="good" />
        <ListSection title={labels.risks} items={snapshot.risks} empty={labels.emptySection} tone="risk" />

        <View style={styles.section}>
          <Text style={styles.sectionTitle} minPresenceAhead={40}>
            {labels.photos}
          </Text>
          {photos.length === 0 ? (
            <Text style={styles.empty}>{labels.emptySection}</Text>
          ) : (
            photos.map((photo) => (
              <View key={photo.id} style={styles.photoBlock} wrap={false}>
                <PdfImage src={photo.dataUrl} style={styles.photo} />
                <Text style={styles.photoTag}>{photo.tag}</Text>
                {photo.note ? (
                  <Text style={styles.photoNote}>
                    {labels.photoNote}: {photo.note}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        <ListSection title={labels.facts} items={snapshot.facts} empty={labels.emptySection} />
        <ListSection
          title={labels.followUps}
          items={snapshot.followUps}
          empty={labels.emptySection}
        />
        <ListSection
          title={labels.actionItems}
          items={snapshot.actionItems}
          empty={labels.emptySection}
        />

        <Text style={styles.disclaimer} orphans={2} widows={2}>
          {snapshot.disclaimer}
        </Text>
        <Text style={styles.generatedAt}>
          {labels.generatedAt}: {formatPdfDate(snapshot.generatedAt, locale)}
        </Text>

        <View style={styles.footer} fixed>
          <Text>KanFangJi</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${labels.page} ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

