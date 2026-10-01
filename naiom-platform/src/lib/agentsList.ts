// Liste légère des agents, utilisable côté navigateur (pages "Monde").
export function listAgentSync(): Array<{ slug: string; name: string; role: string }> {
  return [
    { slug: "orchestrateur", name: "Kélan", role: "Chef d'orchestre" },
    { slug: "strategiste", name: "Amara", role: "Stratège" },
    { slug: "createur-contenu", name: "Aïna", role: "Créateur de contenu" },
    { slug: "designer", name: "Zayna", role: "Creative Strategist" },
    { slug: "analyste", name: "Malik", role: "Analyste" },
    { slug: "presentateur", name: "Imani", role: "Présentateur" },
    { slug: "gmail", name: "Lina", role: "Assistant email" },
    { slug: "fireflies", name: "Sira", role: "Analyste de calls" },
    { slug: "proposition", name: "Idriss", role: "Proposition commerciale" },
    { slug: "cv", name: "Clara", role: "Recruteuse" },
    { slug: "ecommerce", name: "Emma", role: "Agente e-commerce" },
    { slug: "prospection", name: "Sékou", role: "Agent prospection" },
    { slug: "veille", name: "Nali", role: "Veille tendances" },
    { slug: "comptabilite", name: "Chloé", role: "Comptable" },
    { slug: "cerveau", name: "Kéïta", role: "Cerveau de l'entreprise" },
  ];
}
