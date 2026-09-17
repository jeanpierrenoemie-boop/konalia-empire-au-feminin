# PostgreSQL Pilot Startup — Procédure opérationnelle

## Variables d'environnement obligatoires

```bash
# Moteur base de données
DB_DRIVER=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME

# Sécurité
JWT_SECRET=<chaîne aléatoire >= 64 caractères>
JWT_EXPIRES_IN=8h
COOKIE_SECURE=true

# Environnement applicatif — détermine les guards métier
APP_ENV=pilot          # ou production — interdit les comptes is_test et le seed

# CORS
ALLOWED_ORIGINS=https://votre-domaine.fr
APP_BASE_URL=https://votre-domaine.fr

# TLS PostgreSQL (désactiver seulement sur réseau local sécurisé)
# PGSSLMODE=disable
```

⚠️ **Ne jamais mettre** `DATABASE_URL`, `JWT_SECRET` ou un credential réel dans Git.

---

## Création de la base de données PostgreSQL

```sql
-- Connecté en superuser
CREATE USER rc_pilot WITH ENCRYPTED PASSWORD 'changeme-fort';
CREATE DATABASE rc_pilot_db OWNER rc_pilot;
\c rc_pilot_db
CREATE EXTENSION IF NOT EXISTS citext;
```

---

## Migrations

```bash
# Depuis le répertoire server/
node src/db/migrate-pg.js
```

Le script est idempotent (`IF NOT EXISTS` partout) — ré-exécutable sans risque.

---

## Vérification de santé avant démarrage

```bash
# Vérifier la connexion PG
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM users;"

# Vérifier les variables obligatoires
[ -z "$JWT_SECRET" ] && echo "MANQUE: JWT_SECRET" || echo "OK: JWT_SECRET"
[ -z "$DATABASE_URL" ] && echo "MANQUE: DATABASE_URL" || echo "OK: DATABASE_URL"
[ "$APP_ENV" = "pilot" ] || [ "$APP_ENV" = "production" ] && echo "OK: APP_ENV" || echo "⚠️  APP_ENV non configuré en pilot/production"
```

---

## Création du compte admin initial

À effectuer **après** les migrations, via `psql` ou un script one-shot :

```sql
INSERT INTO cohorts (id, name, status)
VALUES ('cohort-pilot-01', 'Cohorte Pilote 2025', 'active');

INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
VALUES (
  gen_random_uuid()::TEXT,
  'admin@votredomaine.fr',
  '<hash bcrypt du mot de passe>',
  'NOEMIE_ADMIN', 'ADMIN', 'Noémie', FALSE
);
```

Pour générer le hash bcrypt depuis Node :
```bash
node -e "
import('./src/auth.js').then(({hashPassword}) =>
  hashPassword('VotreMotDePasse!').then(h => console.log(h))
)"
```

---

## PAS de seed Sarah/Amélie en pilot/production

```bash
# Cette commande échouera avec APP_ENV=pilot ou APP_ENV=production :
node src/fixtures/seed.dev.js
# → REFUSING to seed test fixtures in APP_ENV=pilot (pilot/production).
```

Si `APP_ENV` n'est pas défini, le seed refuse aussi (défaut = `development`, mais
la variable doit être explicitement positionnée pour pilot/production — voir la section
"Vérification de santé" ci-dessus).

---

## Création de la cohorte pilote et première invitation

Via l'API admin (compte admin créé ci-dessus) :

```bash
# 1. Se connecter
curl -c cookies.txt -X POST https://votredomaine.fr/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@votredomaine.fr","password":"VotreMotDePasse!"}'

# 2. Créer une invitation
curl -b cookies.txt -X POST https://votredomaine.fr/api/invitations \
  -H 'Content-Type: application/json' \
  -d '{
    "first_name":"Participante",
    "last_name":"Nom",
    "email":"participante@exemple.fr",
    "cohort_id":"cohort-pilot-01",
    "plan":"STARTER"
  }'
# → Retourne activation_url (valable 72h)
```

---

## Sauvegarde

```bash
# Dump complet (à automatiser en cron)
pg_dump "$DATABASE_URL" --no-password \
  --format=custom \
  --file="backup_$(date +%Y%m%d_%H%M%S).pgdump"

# Restauration
pg_restore --dbname="$DATABASE_URL" backup_YYYYMMDD_HHMMSS.pgdump
```

---

## Démarrage du serveur

```bash
# Variables d'environnement depuis un fichier .env (jamais commité)
node --env-file=.env server.js
# ou
DB_DRIVER=postgres DATABASE_URL=... APP_ENV=pilot JWT_SECRET=... node server.js
```

Le serveur refusera de démarrer si `DB_DRIVER=postgres` sans `DATABASE_URL` :
```
FATAL: DB_DRIVER=postgres requires DATABASE_URL
```
