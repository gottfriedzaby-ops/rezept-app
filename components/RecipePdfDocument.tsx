import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Recipe } from "@/types/recipe";
import { getRecipeSections } from "@/types/recipe";
import { cookTimeLabelFor } from "@/lib/recipeTypeLabels";

const DARK = "#1a1a1a";
const MID = "#555555";
const LIGHT = "#888888";
const RULE = "#dddddd";
const FOREST = "#2d6a4f";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: DARK,
    paddingTop: 52,
    paddingBottom: 52,
    paddingHorizontal: 52,
    lineHeight: 1.4,
  },
  coverImage: {
    width: "100%",
    height: 180,
    objectFit: "cover",
    marginBottom: 20,
    borderRadius: 4,
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    marginBottom: 8,
    color: DARK,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 6,
    fontSize: 9,
    color: MID,
  },
  metaDot: {
    color: RULE,
    marginHorizontal: 4,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 16,
  },
  tag: {
    fontSize: 8,
    color: MID,
    borderWidth: 0.5,
    borderColor: RULE,
    borderRadius: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  typeBadge: {
    fontSize: 8,
    color: FOREST,
    borderWidth: 0.5,
    borderColor: FOREST,
    borderRadius: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: DARK,
    marginBottom: 6,
    marginTop: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingBottom: 3,
  },
  overline: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: LIGHT,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 16,
  },
  ingredientRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  ingredientAmount: {
    width: 72,
    color: DARK,
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
  },
  ingredientName: {
    flex: 1,
    color: MID,
    fontSize: 9.5,
  },
  stepRow: {
    flexDirection: "row",
    marginBottom: 10,
    breakInside: "avoid",
  },
  stepNum: {
    width: 18,
    color: LIGHT,
    fontSize: 9,
    paddingTop: 0.5,
  },
  stepText: {
    flex: 1,
    color: DARK,
    lineHeight: 1.55,
    fontSize: 10,
  },
  timerBadge: {
    fontSize: 8,
    color: LIGHT,
    marginLeft: 4,
  },
  source: {
    marginTop: 24,
    fontSize: 8,
    color: LIGHT,
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    paddingTop: 8,
  },
});

function formatAmount(perServing: number, servings: number): string {
  const total = perServing * servings;
  if (total <= 0) return "";
  const r = Math.round(total * 10) / 10;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
}

const TYPE_LABELS: Record<string, string> = {
  kochen: "🍳 Kochen",
  backen: "🍞 Backen",
  grillen: "🔥 Grillen",
  zubereiten: "🥗 Zubereiten",
};

interface Props {
  recipe: Recipe;
}

export default function RecipePdfDocument({ recipe }: Props) {
  const sections = getRecipeSections(recipe);
  const multiSection = sections.length > 1 || sections[0]?.title !== null;
  const servings = recipe.servings ?? 1;
  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);
  const cookLabel = cookTimeLabelFor(recipe.recipe_type ?? "kochen");
  const typeLabel = TYPE_LABELS[recipe.recipe_type ?? "kochen"];

  // Global step counter across sections
  let globalStep = 0;

  return (
    <Document
      title={recipe.title}
      author="Rezept-App"
      language="de"
    >
      <Page size="A4" style={s.page}>
        {/* Cover image */}
        {recipe.image_url && (
          <Image src={recipe.image_url} style={s.coverImage} />
        )}

        {/* Title */}
        <Text style={s.title}>{recipe.title}</Text>

        {/* Meta row */}
        <View style={s.metaRow}>
          {recipe.prep_time ? (
            <Text>Vorbereitung {recipe.prep_time} Min.</Text>
          ) : null}
          {recipe.prep_time && recipe.cook_time ? (
            <Text style={s.metaDot}>·</Text>
          ) : null}
          {recipe.cook_time ? (
            <Text>{cookLabel} {recipe.cook_time} Min.</Text>
          ) : null}
          {totalTime > 0 && (recipe.prep_time || recipe.cook_time) ? (
            <Text style={s.metaDot}>·</Text>
          ) : null}
          {totalTime > 0 ? (
            <Text>Gesamt {totalTime} Min.</Text>
          ) : null}
          {servings > 0 && totalTime > 0 ? (
            <Text style={s.metaDot}>·</Text>
          ) : null}
          {servings > 0 ? (
            <Text>{servings} Portion{servings !== 1 ? "en" : ""}</Text>
          ) : null}
        </View>

        {/* Tags + type badge */}
        <View style={s.tagsRow}>
          <Text style={s.typeBadge}>{typeLabel}</Text>
          {recipe.tags.map((tag, i) => (
            <Text key={i} style={s.tag}>{tag}</Text>
          ))}
        </View>

        <View style={s.divider} />

        {/* Sections */}
        {sections.map((section, sIdx) => (
          <View key={sIdx}>
            {multiSection && section.title && (
              <Text style={s.sectionTitle}>{section.title}</Text>
            )}

            {/* Ingredients */}
            {(!multiSection || sIdx === 0) && (
              <Text style={s.overline}>Zutaten</Text>
            )}
            {multiSection && section.title === null && sIdx > 0 && (
              <Text style={s.overline}>Zutaten</Text>
            )}
            {section.ingredients.map((ing, i) => (
              <View key={i} style={s.ingredientRow}>
                <Text style={s.ingredientAmount}>
                  {ing.amount > 0
                    ? `${formatAmount(ing.amount, servings)}${ing.unit ? " " + ing.unit : ""}`
                    : ""}
                </Text>
                <Text style={s.ingredientName}>{ing.name}</Text>
              </View>
            ))}

            {/* Steps */}
            {(!multiSection || sIdx === 0) && (
              <Text style={s.overline}>Zubereitung</Text>
            )}
            {multiSection && section.title === null && sIdx > 0 && (
              <Text style={s.overline}>Zubereitung</Text>
            )}
            {section.steps.map((step) => {
              globalStep++;
              return (
                <View key={step.order} style={s.stepRow}>
                  <Text style={s.stepNum}>{globalStep}.</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.stepText}>
                      {step.text}
                      {step.timerSeconds ? (
                        <Text style={s.timerBadge}>
                          {" "}({Math.round(step.timerSeconds / 60)} Min.)
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {/* Source credit */}
        {(recipe.source_type !== "manual") && (
          <Text style={s.source}>
            Quelle:{" "}
            {recipe.source_type === "youtube"
              ? `YouTube · ${recipe.source_title ?? recipe.source_value}`
              : recipe.source_type === "instagram"
              ? `Instagram · ${recipe.source_title ?? recipe.source_value}`
              : (recipe.source_title ?? recipe.source_value ?? "").slice(0, 100)}
          </Text>
        )}
      </Page>
    </Document>
  );
}
