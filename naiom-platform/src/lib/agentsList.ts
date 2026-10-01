// Liste légère des agents, utilisable côté navigateur (pages "Monde").
export function listAgentSync(): Array<{ slug: string; name: string; role: string }> {
  return [
    { slug: "orchestrateur", name: "Noam", role: "Chef d'orchestre" },
    { slug: "strategiste", name: "Antoine", role: "Stratège" },
    { slug: "createur-contenu", name: "Léa", role: "Créateur de contenu" },
    { slug: "designer", name: "Mia", role: "Creative Strategist" },
    { slug: "analyste", name: "Léo", role: "Analyste" },
    { slug: "presentateur", name: "Hugo", role: "Présentateur" },
    { slug: "gmail", name: "Inès", role: "Assistant email" },
    { slug: "fireflies", name: "Jules", role: "Analyste de calls" },
    { slug: "proposition", name: "Victor", role: "Proposition commerciale" },
    { slug: "cv", name: "Clara", role: "Recruteuse" },
    { slug: "ecommerce", name: "Emma", role: "Agente e-commerce" },
    { slug: "prospection", name: "Sacha", role: "Agent prospection" },
    { slug: "veille", name: "Nina", role: "Veille tendances" },
    { slug: "comptabilite", name: "Chloé", role: "Comptable" },
    { slug: "cerveau", name: "Clément", role: "Cerveau de l'entreprise" },
  ];
}
