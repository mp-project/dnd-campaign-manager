# 🐉 D&D Campaign Manager

A web-based campaign builder and game master tool for managing immersive, decision-driven Dungeons & Dragons campaigns.

## 🚀 Tech Stack

- **Frontend**: JavaScript, Tailwind CSS, Next.js (App Router)
- **Backend**: Node.js, Prisma ORM
- **Database**: PostgreSQL (later on Vercel)
- **Auth**: NextAuth.js (Credentials + Google/GitHub)
- **Other**: Zod for validation, FontAwesome for icons
- **Hosting**: Vercel (planned)
- **Version Control**: GitHub

## 📦 Features (Planned)

- User account system
- Campaign creation with scenes and decision trees
- Linkable assets: NPCs, Monsters, Items, Locations
- GM mode to follow narrative paths and track decisions
- dice rolling and encounter presets/templates
- Asset hover previews
- Campaign logs, progress stats & summaries
- Auto difficulty balancing & stat generation

## 🧭 Roadmap (Development Plan)

### ✅ Phase 1: Environment Setup *(in progress)*
- [x] Initialize Next.js project with App Router
- [x] Add Tailwind CSS
- [x] Setup Git and connect to GitHub
- [ ] Create base file structure (components, features, prisma, etc.)
- [ ] Initialize Prisma + configure SQLite
- [ ] Setup `User` model as initial schema
- [ ] Setup `Campaign, Scene, Decision,DecisionTree, Player` models
- [ ] Setup `NPC, Monster, Item, Location` models
- [ ] Setup `Encounter, EncounterTemplate` models
- [ ] Add first seed script & dummy data
- [ ] Setup logging and error handling

### 🔐 Phase 2: Auth & User Systems
- [ ] Setup NextAuth.js (credentials, Google, GitHub)
- [ ] Create user dashboard and profile management
- [ ] Campaign visibility settings (private/public)

### 🔄 Phase 3: Asset & Campaign Management
- [ ] Create UI to add/edit NPCs, Monsters, Items, Locations
- [ ] Implement asset referencing in scenes and other assets
- [ ] Create UI to add/edit campaigns
- [ ] Link assets in scenes with hover previews
- [ ] Build decision-tree scene editor with linking logic
- [ ] Implement auto difficulty balancing for encounters
- [ ] Implement encounter template system
- [ ] Create dice rolling feature with presets/templates
- [ ] Implement GM mode for following narrative paths
- [ ] Implement GM view for playing through scenes with decisions


### 📊 Phase 4: Logging & Stats
- [ ] Campaign progress tracker
- [ ] Decision summary view
- [ ] Encounter and reward log

### 🌐 Phase 5: UI/UX & Deployment
- [ ] Add responsive design & placeholders
- [ ] Add loading animations & transitions
- [ ] Deploy to Vercel
- [ ] Write user documentation / wiki

## 💡 Why this project?

This project is both a portfolio piece and a personal tool for learning full-stack development using modern technologies while building something fun and useful for tabletop RPGs.

## 🤝 Contributions

This is a learning project so please excuse any rough edges. 
