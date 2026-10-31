// Suivi de chantier : connexion, tableau de bord, postes, planning, devis et factures.
(function () {
  'use strict';

  // Le foyer partage un compte : l'appareil dit qui agit (Android = Yoann,
  // iPhone = Sophie) ; sur PC, le choix est gardé dans le navigateur.
  const AUTEURS = ['Yoann', 'Sophie'];
  function appareil() {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPhone';
    return 'PC';
  }
  function auteur() {
    if (appareil() === 'Android') return 'Yoann';
    if (appareil() === 'iPhone') return 'Sophie';
    try { return localStorage.getItem('chantier-auteur'); } catch (e) { return null; }
  }
  const base = creerBase(window.CHANTIER_CONFIG || {});
  const signer = champs => ({ ...champs, auteur: auteur() });
  const db = {
    ...base,
    ajouter: (table, lignes) => base.ajouter(table, [].concat(lignes).map(signer)),
    modifier: (table, id, champs) => base.modifier(table, id, signer(champs)),
  };
  const TABLES = ['postes', 'devis', 'devis_historique', 'factures', 'taches', 'relances', 'reglages'];
  const D = Object.fromEntries(TABLES.map(t => [t, []]));
  const filtres = { planning: 'tout', vue: 'liste', factures: 'a_payer' };

  const NOUS = 'Nous';
  const STATUTS_POSTE = { a_contacter: 'À contacter', relance: 'Relancé', planifie: 'Planifié', en_cours: 'En cours', termine: 'Terminé' };
  const TON_POSTE = { a_contacter: 'neutre', relance: 'att', planifie: 'info', en_cours: 'info', termine: 'ok' };
  const STATUTS_DEVIS = { estimatif: 'Estimatif', valide: 'Validé', refuse: 'Refusé' };
  const TON_DEVIS = { estimatif: 'neutre', valide: 'ok', refuse: 'mal' };
  const STATUTS_FACTURE = { a_payer: 'À payer', paye: 'Payée' };
  const SOURCES = { banque: 'Banque', apport: 'Apport personnel' };
  const STATUTS_TACHE = { a_faire: 'À faire', en_cours: 'En cours', fait: 'Fait' };
  const MOYENS = { telephone: 'Téléphone', sms: 'SMS', email: 'E-mail', sur_place: 'Sur place' };

  // ---------- Outils ----------

  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (v == null || v === '' ? null : Number(v));
  const somme = l => l.reduce((a, v) => a + (num(v) || 0), 0);
  const arrondi = v => Math.round(v * 100) / 100;
  const fmtEuros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const euros = v => (num(v) == null ? '—' : fmtEuros.format(v));
  const ecart = v => (v > 0 ? '+' : '') + fmtEuros.format(v);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) + ' %' : '—');
  const jour = s => new Date(s + 'T00:00:00');
  const date = s => (s ? jour(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const dateCourte = s => (s ? jour(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const aujourdhui = () => iso(new Date());
  const trouve = (table, id) => D[table].find(x => x.id === id);
  const pastille = (texte, ton) => `<span class="pastille ${ton}">${esc(texte)}</span>`;
  const entreprises = () => [...new Set(D.postes.map(p => p.entreprise).filter(Boolean))].sort();
  const optionsPostes = () => Object.fromEntries(D.postes.map(p => [p.id, p.nom]));
  const montantDevis = d => num(d.montant_valide) ?? num(d.montant_estimatif);

  function periode(debut, fin) {
    if (!debut && !fin) return '';
    if (!debut || !fin || debut === fin) return date(debut || fin);
    return `${dateCourte(debut)} → ${date(fin)}`;
  }

  function message(texte, erreur) {
    if (/row-level security/i.test(texte)) texte = 'Accès refusé : ce compte n\'est pas autorisé.';
    const t = $('#toast');
    t.textContent = texte;
    t.classList.toggle('erreur', !!erreur);
    t.hidden = false;
    clearTimeout(message.minuteur);
    message.minuteur = setTimeout(() => { t.hidden = true; }, erreur ? 6000 : 2500);
  }

  async function charger() {
    const res = await Promise.all(TABLES.map(t => db.lister(t)));
    TABLES.forEach((t, i) => { D[t] = res[i]; });
  }

  async function rafraichir() {
    try {
      await charger();
    } catch (e) {
      message(e.message, true);
    }
    afficher();
  }

  // ---------- Calculs ----------

  function bilanPoste(p) {
    const devis = D.devis.filter(x => x.poste_id === p.id && x.statut !== 'refuse');
    const factures = D.factures.filter(x => x.poste_id === p.id);
    const b = {
      devis: somme(devis.map(montantDevis)),
      initial: somme(devis.map(x => x.montant_initial)),
      valide: somme(devis.filter(x => x.statut === 'valide').map(montantDevis)),
      toutValide: devis.length > 0 && devis.every(x => x.statut === 'valide'),
      manque: devis.some(x => montantDevis(x) == null),
      facture: somme(factures.map(x => x.montant_ttc)),
      paye: somme(factures.map(x => x.montant_regle ?? (x.statut === 'paye' ? x.montant_ttc : 0))),
    };
    b.derive = arrondi(b.devis - b.initial);
    b.reste = Math.max(b.devis, b.facture) - b.paye;
    // Un poste sans devis (dossier DP, par exemple) n'est pas un dépassement.
    b.alerte = devis.length && b.facture > b.devis + 0.005 ? 'mal' : b.derive > 0.005 ? 'att' : '';
    return b;
  }

  function alertes(lignes) {
    const a = [];
    for (const d of D.devis) {
      if (d.statut !== 'estimatif' || !d.date_validite) continue;
      const jours = Math.round((jour(d.date_validite) - jour(aujourdhui())) / 86400000);
      if (jours > 21) continue;
      const p = trouve('postes', d.poste_id);
      const quoi = `Devis ${d.numero || ''} (${p ? p.nom : d.entreprise})`;
      a.push([jours <= 7 ? 'mal' : 'att', jours < 0 ? `${quoi} expiré le ${date(d.date_validite)}` : `${quoi} valable jusqu'au ${date(d.date_validite)}`, p ? `#poste/${p.id}` : '#devis']);
    }
    for (const { p, b } of lignes) {
      if (b.alerte === 'mal') a.push(['mal', `${p.nom} : facturé ${euros(b.facture)}, au-dessus du devis (${euros(b.devis)})`, `#poste/${p.id}`]);
      else if (b.alerte === 'att') a.push(['att', `${p.nom} : devis en hausse de ${ecart(b.derive)}`, `#poste/${p.id}`]);
      if (b.manque) a.push(['att', `${p.nom} : montant du devis à relever`, `#poste/${p.id}`]);
    }
    const cuisine = D.postes.find(p => p.code === 'cuisine');
    if (cuisine && !D.devis.some(d => d.poste_id === cuisine.id && d.statut === 'valide')) {
      // La livraison = le début prévu de l'intervention Ixina au planning.
      const livraison = D.taches.filter(t => t.poste_id === cuisine.id && estArtisan(t) && t.debut).map(t => t.debut).sort()[0];
      if (livraison) {
        const limite = jour(livraison);
        limite.setMonth(limite.getMonth() - 3);
        const jours = Math.round((limite - jour(aujourdhui())) / 86400000);
        a.push([jours <= 30 ? 'mal' : 'att', `Cuisine : confirmer la commande avant le ${date(iso(limite))}`, `#poste/${cuisine.id}`]);
      } else {
        a.push(['att', 'Cuisine : renseigner la date de livraison au planning pour connaître la limite de commande', `#poste/${cuisine.id}`]);
      }
    }
    const aPayer = D.factures.filter(f => f.statut === 'a_payer');
    if (aPayer.length) {
      const reste = somme(aPayer.map(f => (num(f.montant_ttc) || 0) - (num(f.montant_regle) || 0)));
      a.push(['info', `${aPayer.length} facture${aPayer.length > 1 ? 's' : ''} à payer : ${euros(reste)}`, '#factures']);
    }
    const desordre = D.taches.filter(t => t.statut !== 'fait' && conflit(t));
    if (desordre.length) a.push(['mal', `${desordre.length} tâche${desordre.length > 1 ? 's commencent' : ' commence'} avant la fin de celle qui doit passer avant`, '#planning']);
    const retard = D.taches.filter(t => t.statut !== 'fait' && !t.fin_reelle && t.fin && t.fin < aujourdhui());
    if (retard.length) a.push(['mal', `${retard.length} tâche${retard.length > 1 ? 's' : ''} en retard`, '#planning']);
    return a;
  }

  // ---------- Vues ----------

  function vueBilan() {
    const qui = auteur();
    const compte = `<p class="compte-mobile"><small>${qui ? `${esc(qui)} (${appareil()})` : esc(vueBilan.compte)}</small> · <button class="lien" data-action="deconnexion">Se déconnecter</button></p>`;
    if (!D.postes.length) {
      // seed.js reste hors du dépôt public : sans lui, on part d'un chantier vide.
      const charger = window.DONNEES_INITIALES
        ? `<p>Les postes, les devis et les tâches du cadrage peuvent être chargés en une fois, puis complétés au fil du chantier.</p>
          <button class="btn principal" data-action="precharger">Charger les données du chantier</button>`
        : '<p>Ajoute un premier poste depuis l\'écran Postes.</p>';
      return `<h1>Tableau de bord</h1>
        <div class="vide"><p>Aucun poste pour l'instant.</p>${charger}</div>${db.demo ? '' : compte}`;
    }
    const lignes = D.postes.map(p => ({ p, b: bilanPoste(p) }));
    const t = {};
    for (const k of ['devis', 'valide', 'facture', 'paye', 'reste']) t[k] = somme(lignes.map(l => l.b[k]));
    const a = alertes(lignes);
    // Chaque carte ouvre son détail : c'est là que vivent devis et factures.
    const chiffre = (classe, lien, lib, v, detail) => `<a class="chiffre ${classe}" href="${lien}"><span>${lib}</span><strong>${euros(v)}</strong>${detail ? `<small>${detail}</small>` : ''}<i class="chiffre-voir" aria-hidden="true">›</i></a>`;
    const termines = D.postes.filter(p => p.statut === 'termine').length;

    return `<h1>Tableau de bord</h1>
      <section class="chiffres">
        ${chiffre('devis', '#devis', 'Devis retenus', t.devis, `dont ${euros(t.valide)} validés`)}
        ${chiffre('facture', '#factures/toutes', 'Facturé', t.facture)}
        ${chiffre('paye', '#factures/paye', 'Payé', t.paye, `${pct(t.paye, t.devis)} des devis`)}
        ${chiffre('reste', '#reste', 'Reste à payer', t.reste)}
      </section>
      ${jaugeBudget(t)}
      <section aria-label="Avancement des travaux">
        ${metre('Travaux', termines / D.postes.length, `${termines} poste${termines > 1 ? 's' : ''} terminé${termines > 1 ? 's' : ''} sur ${D.postes.length}`)}
      </section>
      ${a.length ? `<section><h2>À surveiller</h2><ul class="alertes">${a.map(([ton, txt, lien]) => `<li class="${ton}"><a href="${lien}">${esc(txt)}</a></li>`).join('')}</ul></section>` : ''}
      <section>
        <h2>Par poste</h2>
        <table class="bilan">
          <thead><tr><th>Poste</th><th>Devis</th><th>Facturé</th><th>Payé</th><th>Reste</th></tr></thead>
          <tbody>${lignes.map(({ p, b }) => `<tr class="${b.alerte}">
            <td><a href="#poste/${p.id}">${esc(p.nom)}</a><small>${esc(p.entreprise)}</small></td>
            <td data-label="Devis">${b.manque && !b.devis ? '<small>à relever</small>' : euros(b.devis)}${b.devis && !b.toutValide ? '<small>estimatif</small>' : ''}${b.derive ? `<small class="ecart">${ecart(b.derive)}</small>` : ''}</td>
            <td data-label="Facturé">${euros(b.facture)}</td>
            <td data-label="Payé">${euros(b.paye)}${b.paye ? `<small>${pct(b.paye, b.devis)}</small>` : ''}</td>
            <td data-label="Reste">${euros(b.reste)}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td data-label="Devis">${euros(t.devis)}</td><td data-label="Facturé">${euros(t.facture)}</td><td data-label="Payé">${euros(t.paye)}</td><td data-label="Reste">${euros(t.reste)}</td></tr></tfoot>
        </table>
      </section>${db.demo ? '' : compte}`;
  }

  // Graduation « ronde » de l'axe : 1, 2, 2,5 ou 5 fois une puissance de 10.
  function graduation(max) {
    const brut = max / 4;
    const puissance = 10 ** Math.floor(Math.log10(brut));
    const pas = [1, 2, 2.5, 5, 10].find(m => m * puissance >= brut) * puissance;
    return { pas, haut: Math.ceil(max / pas) * pas };
  }
  const kEuros = v => `${(v / 1000).toLocaleString('fr-FR')} k€`;

  // Jauge budget : les devis (hachurés comme un plan), le facturé par-dessus,
  // le payé dedans, et le budget en piquet de balisage.
  function jaugeBudget(t) {
    const budget = num((trouve('reglages', 'budget') || {}).valeur);
    const { pas, haut } = graduation(Math.max(budget || 0, t.devis, t.facture, 1) * 1.04);
    const x = v => ((v / haut) * 100).toFixed(2);
    const marge = budget != null ? budget - t.devis : null;
    let titre;
    if (budget == null) titre = `<strong>${euros(t.devis)}</strong> de devis retenus. Fixe un budget pour voir la marge.`;
    else if (marge >= 0) titre = `Marge : <strong class="bon">${euros(marge)}</strong> sous le budget de ${euros(budget)}`;
    else titre = `Dépassement : <strong class="mauvais">${euros(-marge)}</strong> au-dessus du budget de ${euros(budget)}`;

    const graduations = [];
    for (let v = 0; v <= haut + 0.5; v += pas) {
      if (budget != null && Math.abs(v - budget) < haut * 0.15) continue;
      graduations.push(`<span style="left:${x(v)}%">${v ? kEuros(v) : '0'}</span>`);
    }
    const ancre = v => (v / haut > 0.85 ? 'droite' : v / haut < 0.12 ? 'gauche' : '');
    const resume = `Devis ${euros(t.devis)}, facturé ${euros(t.facture)}, payé ${euros(t.paye)}${budget != null ? `, budget ${euros(budget)}` : ''}.`;

    return `<section class="budget">
      <header class="entete"><h2>Budget</h2><button class="btn petit" data-action="budget">${budget == null ? 'Fixer le budget' : 'Modifier le budget'}</button></header>
      <div class="budget-carte">
        <p class="budget-titre">${titre}</p>
        <div class="jauge" role="img" aria-label="${esc(resume)}">
          <div class="jauge-piste">
            <div class="j-devis" style="width:${x(t.devis)}%" data-info="Devis retenus : ${euros(t.devis)}"></div>
            <div class="j-facture" style="width:${x(t.facture)}%" data-info="Facturé : ${euros(t.facture)}"></div>
            <div class="j-paye" style="width:${x(t.paye)}%" data-info="Payé : ${euros(t.paye)}"></div>
            ${budget != null ? `<div class="j-budget" style="left:${x(budget)}%" data-info="Budget : ${euros(budget)}"></div>` : ''}
            <div class="j-ici ${ancre(t.facture)}" style="left:${x(t.facture)}%"><svg aria-hidden="true"><use href="#i-maison"/></svg><span>On en est là</span></div>
          </div>
          <div class="jauge-axe">${graduations.join('')}${budget != null ? `<span class="axe-budget ${ancre(budget)}" style="left:${x(budget)}%">Budget ${kEuros(budget)}</span>` : ''}</div>
        </div>
        <ul class="legende">
          <li><i class="l-devis"></i>Devis <strong>${budget ? pct(t.devis, budget) + ' du budget' : euros(t.devis)}</strong></li>
          <li><i class="l-facture"></i>Facturé <strong>${pct(t.facture, t.devis)} des devis</strong></li>
          <li><i class="l-paye"></i>Payé <strong>${pct(t.paye, t.facture)} du facturé</strong></li>
        </ul>
      </div>
    </section>`;
  }

  function formBudget() {
    const r = trouve('reglages', 'budget');
    ouvrirFormulaire({
      titre: 'Budget du chantier',
      valeurs: { valeur: r ? r.valeur : null },
      champs: [{ nom: 'valeur', libelle: 'Enveloppe totale TTC (extension, cuisine, frais)', type: 'euros' }],
      enregistrer: x => (r ? db.modifier('reglages', 'budget', { valeur: x.valeur }) : db.ajouter('reglages', { id: 'budget', valeur: x.valeur })),
    });
  }

  // Avancement dessiné comme un mètre ruban qui se déroule depuis son boîtier.
  function metre(libelle, part, detail) {
    const p = Math.max(0, Math.min(1, part || 0)) * 100;
    return `<div class="metre">
      <div class="metre-tete"><span>${libelle}</span><small>${detail}</small></div>
      <div class="metre-piste" role="progressbar" aria-label="${libelle}" aria-valuenow="${Math.round(p)}" aria-valuemin="0" aria-valuemax="100">
        <span class="metre-boitier"></span>
        <div class="metre-rail"><div class="metre-ruban" style="width:${p.toFixed(1)}%"></div></div>
      </div>
    </div>`;
  }

  // Les dates d'un poste viennent de ses tâches au planning (prévu ou réalisé).
  function periodeTaches(taches, debut, fin) {
    const d = taches.map(t => t[debut] || t[fin]).filter(Boolean).sort();
    const f = taches.map(t => t[fin] || t[debut]).filter(Boolean).sort();
    return d.length ? periode(d[0], f[f.length - 1]) : '';
  }

  function vuePostes() {
    return `<header class="entete"><h1>Postes</h1><button class="btn" data-action="nouveau-poste">Ajouter un poste</button></header>
      <p class="resume">Un poste par lot de travaux : son entreprise, ses devis, ses factures et ses relances. Les dates se gèrent dans le Planning.</p>
      ${D.postes.length ? '' : '<p class="vide">Aucun poste pour l\'instant.</p>'}
      <ol class="liste">${D.postes.map(p => {
        const taches = D.taches.filter(t => t.poste_id === p.id);
        const reel = periodeTaches(taches, 'debut_reel', 'fin_reelle');
        const dates = reel || periodeTaches(taches, 'debut', 'fin');
        return `<li><a class="ligne" href="#poste/${p.id}">
          <span class="rang">${esc(p.ordre)}</span>
          <span class="corps"><strong>${esc(p.nom)}</strong><small>${esc(p.entreprise)}${dates ? ` · ${dates}${reel ? '' : ' (prévu)'}` : ''}</small></span>
          ${pastille(STATUTS_POSTE[p.statut], TON_POSTE[p.statut])}
        </a></li>`;
      }).join('')}</ol>`;
  }

  function vuePoste(id) {
    const p = trouve('postes', id);
    if (!p) return '<p class="vide">Ce poste n\'existe plus. <a href="#postes">Retour aux postes</a></p>';
    const b = bilanPoste(p);
    const devis = D.devis.filter(x => x.poste_id === id);
    const factures = D.factures.filter(x => x.poste_id === id);
    const relances = D.relances.filter(x => x.poste_id === id);
    const taches = D.taches.filter(x => x.poste_id === id);
    const section = (titre, action, contenu, vide) => `<section class="bloc">
      <header class="entete"><h2>${titre}</h2><button class="btn petit" data-action="${action}" data-poste="${id}">Ajouter</button></header>
      ${contenu || `<p class="discret">${vide}</p>`}</section>`;
    const infos = [
      ['Contact', esc(p.contact)],
      ['Téléphone', p.telephone ? `<a href="tel:${esc(p.telephone.replace(/\s/g, ''))}">${esc(p.telephone)}</a>` : ''],
      ['E-mail', p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ''],
      ['Prévu', periodeTaches(taches, 'debut', 'fin')],
      ['Réalisé', periodeTaches(taches, 'debut_reel', 'fin_reelle')],
    ].filter(([, v]) => v);

    return `<p class="retour"><a href="#postes">← Postes</a></p>
      <header class="entete">
        <div><h1>${esc(p.nom)}</h1><p class="discret">${esc(p.entreprise)}</p></div>
        <div class="actions">${pastille(STATUTS_POSTE[p.statut], TON_POSTE[p.statut])}<button class="btn" data-action="modifier-poste" data-id="${id}">Modifier</button></div>
      </header>
      <dl class="infos">
        ${infos.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
        <div><dt>Devis</dt><dd>${euros(b.devis)}${b.derive ? ` <span class="ecart">${ecart(b.derive)}</span>` : ''}</dd></div>
        <div><dt>Payé</dt><dd>${euros(b.paye)} <small class="discret">(${pct(b.paye, b.devis)})</small></dd></div>
        <div><dt>Reste à payer</dt><dd>${euros(b.reste)}</dd></div>
      </dl>
      ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}
      ${section('Devis', 'nouveau-devis', devis.length && `<ul class="liste">${devis.map(ligneDevis).join('')}</ul>`, 'Aucun devis.')}
      ${section('Factures', 'nouvelle-facture', factures.length && `<ul class="liste">${factures.map(ligneFacture).join('')}</ul>`, 'Aucune facture.')}
      ${section('Relances', 'nouvelle-relance', relances.length && `<ul class="liste">${relances.map(r => `<li><button class="ligne" data-action="relance" data-id="${r.id}">
          <span class="corps"><strong>${date(r.date_relance)}${r.moyen ? ` · ${esc(MOYENS[r.moyen] || r.moyen)}` : ''}</strong><small>${esc(r.reponse) || 'Pas de réponse notée'}${r.auteur ? ` · par ${esc(r.auteur)}` : ''}</small></span>
        </button></li>`).join('')}</ul>`, 'Aucune relance.')}
      ${section('Au planning', 'nouvelle-tache', taches.length && tableauPlanning(trierTaches(taches), false), 'Aucune tâche liée.')}`;
  }

  function ligneDevis(d) {
    const p = trouve('postes', d.poste_id);
    const m = montantDevis(d);
    const derive = m != null && d.montant_initial != null ? arrondi(m - d.montant_initial) : 0;
    return `<li><button class="ligne" data-action="devis" data-id="${d.id}">
      <span class="corps"><strong>${esc(p ? p.nom : 'Sans poste')}</strong><small>N° ${esc(d.numero || '—')} · ${esc(d.entreprise)}${d.statut === 'estimatif' && d.date_validite ? ` · valable jusqu'au ${date(d.date_validite)}` : ''}</small></span>
      <span class="montant">${m == null ? '<small>à relever</small>' : euros(m)}${derive ? `<small class="ecart">${ecart(derive)}</small>` : ''}</span>
      ${pastille(STATUTS_DEVIS[d.statut], TON_DEVIS[d.statut])}
    </button></li>`;
  }

  function ligneFacture(f) {
    const p = trouve('postes', f.poste_id);
    const partiel = f.statut === 'a_payer' && num(f.montant_regle) ? `<small>${euros(f.montant_regle)} réglés</small>` : '';
    return `<li><button class="ligne" data-action="facture" data-id="${f.id}">
      <span class="corps"><strong>${esc(f.entreprise || '—')} · N° ${esc(f.numero || '—')}</strong><small>${esc(p ? p.nom : 'Sans poste')}${f.date_facture ? ` · ${date(f.date_facture)}` : ''}${f.date_reglement ? ` · réglée le ${date(f.date_reglement)}` : ''}${f.source ? ` · ${SOURCES[f.source]}` : ''}</small></span>
      <span class="montant">${euros(f.montant_ttc)}${partiel}</span>
      ${pastille(STATUTS_FACTURE[f.statut], f.statut === 'paye' ? 'ok' : 'att')}
    </button></li>`;
  }

  // Ordre d'enchaînement, puis date prévue.
  const trierTaches = liste => liste.slice().sort((a, b) => (a.ordre - b.ordre) || (a.debut || a.fin || '9').localeCompare(b.debut || b.fin || '9'));
  const estArtisan = t => ![NOUS, ...AUTEURS].includes(t.responsable || NOUS);
  const debutDe = t => t.debut_reel || t.debut || t.fin;
  const finDe = t => t.fin_reelle || t.fin || t.debut_reel || t.debut;

  // Une tâche qui démarre avant la fin de celle qu'elle doit suivre.
  function conflit(t) {
    const avant = t.apres_id && trouve('taches', t.apres_id);
    const finAvant = avant && finDe(avant);
    const debut = debutDe(t);
    return finAvant && debut && debut < finAvant ? avant : null;
  }

  // Le planning global : une ligne par tâche, artisans et nous mêlés, dans l'ordre.
  function tableauPlanning(taches, deplacable) {
    const ligne = (t, i) => {
      const fait = t.statut === 'fait';
      const retard = !fait && !t.fin_reelle && t.fin && t.fin < aujourdhui();
      const c = conflit(t);
      const p = trouve('postes', t.poste_id);
      const type = p && p.nom !== t.titre ? p.nom : '';
      const fleches = deplacable ? `<span class="fleches">
          <button class="fleche" data-action="monter" data-id="${t.id}" aria-label="Monter" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="fleche" data-action="descendre" data-id="${t.id}" aria-label="Descendre" ${i === taches.length - 1 ? 'disabled' : ''}>▼</button>
        </span>` : '';
      return `<tr class="${fait ? 'fait' : ''} ${estArtisan(t) ? 'artisan' : 'nous'}">
        <td class="p-rang"><span class="rang">${i + 1}</span>${fleches}</td>
        <td class="p-tache"><button class="lien-ligne" data-action="tache" data-id="${t.id}"><strong>${esc(t.titre)}</strong>${type ? `<small>${esc(type)}</small>` : ''}${c ? `<small class="retard">⚠ commence avant la fin de « ${esc(c.titre)} »</small>` : ''}</button></td>
        <td class="p-qui" data-label="Qui"><span class="qui ${estArtisan(t) ? 'artisan' : 'nous'}">${esc(t.responsable || NOUS)}</span></td>
        <td data-label="Prévu"><span class="${retard ? 'retard' : ''}">${periode(t.debut, t.fin) || '—'}</span></td>
        <td data-label="Réalisé">${periode(t.debut_reel, t.fin_reelle) || '—'}</td>
        <td class="p-case"><button class="case" data-action="cocher" data-id="${t.id}" aria-pressed="${fait}" aria-label="${fait ? 'Marquer à faire' : 'Marquer fait'}"></button></td>
      </tr>`;
    };
    return `<table class="planning">
      <thead><tr><th>#</th><th>Tâche</th><th>Qui</th><th>Prévu</th><th>Réalisé</th><th><span class="visually-hidden">Fait</span></th></tr></thead>
      <tbody>${taches.map(ligne).join('')}</tbody>
    </table>`;
  }

  // Gantt : une ligne par tâche datée, dans l'ordre du planning. Barre claire
  // pour le prévu, barre pleine pour le réalisé ; 4 px par jour.
  function vueGantt(taches) {
    const PX = 4;
    const J = 86400000;
    const lignes = taches.filter(t => debutDe(t));
    const sansDate = taches.filter(t => !debutDe(t));
    const aDater = sansDate.length ? `<section class="bloc"><h2>À dater</h2><div class="a-dater">${sansDate.map(t =>
      `<button class="puce" data-action="tache" data-id="${t.id}">${esc(t.titre)}</button>`).join('')}</div></section>` : '';
    if (!lignes.length) {
      return `<p class="vide">Aucune date encore. Renseigne les dates prévues des tâches pour les voir ici.</p>${aDater}`;
    }

    const lundi = d => { const x = jour(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const dates = lignes.flatMap(t => [t.debut, t.fin, t.debut_reel, t.fin_reelle]).filter(Boolean).concat(aujourdhui()).sort();
    const d0 = lundi(dates[0]);
    const d1 = new Date(jour(dates[dates.length - 1]).getTime() + 14 * J);
    const x = d => Math.round((jour(d) - d0) / J) * PX;
    const largeur = Math.round((d1 - d0) / J) * PX;

    const mois = [];
    for (const m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); m < d1; m.setMonth(m.getMonth() + 1)) {
      mois.push(`<span style="left:${x(iso(m))}px">${m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}</span>`);
    }
    const segment = (t, debut, fin, classe, quoi) => {
      if (!debut && !fin) return '';
      const jalon = !debut || !fin;
      const l = x(debut || fin);
      const w = jalon ? 0 : Math.max(PX * 2, x(fin) - l + PX);
      const info = `${t.titre} · ${t.responsable || NOUS} · ${quoi} ${periode(debut, fin)}`;
      return `<button class="g-barre ${classe}${jalon ? ' jalon' : ''}" style="left:${l}px;width:${w}px" data-action="tache" data-id="${t.id}" data-info="${esc(info)}" aria-label="${esc(info)}"></button>`;
    };
    const barres = t => {
      const qui = estArtisan(t) ? 'artisan' : 'nous';
      const c = conflit(t) ? ' conflit' : '';
      const fait = t.statut === 'fait' ? ' fait' : '';
      return segment(t, t.debut, t.fin, `prevu ${qui}${c}`, 'prévu')
        + segment(t, t.debut_reel, t.fin_reelle, `reel ${qui}${fait}`, 'réalisé');
    };

    return `<div class="gantt-cadre"><div class="gantt" style="--largeur:${largeur}px;--auj:${x(aujourdhui())}px;--semaine:${PX * 7}px">
        <div class="g-ligne g-tete"><div class="g-nom"></div><div class="g-piste">${mois.join('')}</div></div>
        ${lignes.map(t => `<div class="g-ligne"><div class="g-nom"><strong>${esc(t.titre)}</strong><small>${esc(t.responsable || NOUS)}</small></div><div class="g-piste">${barres(t)}</div></div>`).join('')}
      </div></div>
      <ul class="legende"><li><i class="l-artisan"></i>Artisans</li><li><i class="l-nous"></i>Nous</li><li><i class="l-prevu"></i>Prévu</li><li><i class="l-reel"></i>Réalisé</li><li><i class="l-conflit"></i>Ordre à revoir</li><li><i class="l-auj"></i>Aujourd'hui</li></ul>
      ${aDater}`;
  }

  function vuePlanning() {
    const taches = trierTaches(D.taches).filter(t => filtres.planning === 'tout' || (filtres.planning === 'nous') !== estArtisan(t));
    const choix = `<div class="choix-planning">${puces('vue', { liste: 'Liste', gantt: 'Gantt' })}${puces('planning', { tout: 'Tout', artisans: 'Artisans', nous: 'Nous' })}</div>`;
    const contenu = !taches.length ? '<p class="vide">Rien à afficher.</p>'
      : filtres.vue === 'gantt' ? vueGantt(taches)
        : tableauPlanning(taches, filtres.planning === 'tout');
    return `<header class="entete"><h1>Planning</h1><button class="btn" data-action="nouvelle-tache">Ajouter une tâche</button></header>
      ${choix}${contenu}`;
  }

  function puces(groupe, choix) {
    return `<div class="puces" role="group">${Object.entries(choix).map(([v, l]) =>
      `<button class="puce" data-action="filtre" data-groupe="${groupe}" data-valeur="${v}" aria-pressed="${filtres[groupe] === v}">${l}</button>`).join('')}</div>`;
  }

  function vueDevis() {
    const ordre = id => (trouve('postes', id) || { ordre: 9999 }).ordre;
    const liste = D.devis.slice().sort((a, b) => ordre(a.poste_id) - ordre(b.poste_id));
    const retenus = liste.filter(d => d.statut !== 'refuse');
    const total = somme(retenus.map(montantDevis));
    const derive = arrondi(total - somme(retenus.map(d => d.montant_initial)));
    return `<p class="retour"><a href="#bilan">← Bilan</a></p>
      <header class="entete"><h1>Devis</h1><button class="btn" data-action="nouveau-devis">Ajouter un devis</button></header>
      <p class="resume">Retenus : <strong>${euros(total)}</strong> · validés : ${euros(somme(retenus.filter(d => d.statut === 'valide').map(montantDevis)))}${derive ? ` · dérive : <span class="ecart">${ecart(derive)}</span>` : ''}</p>
      <ul class="liste">${liste.map(ligneDevis).join('')}</ul>`;
  }

  const aRegler = f => (num(f.montant_ttc) || 0) - (num(f.montant_regle) || 0);
  const regle = f => num(f.montant_regle) ?? (f.statut === 'paye' ? num(f.montant_ttc) : 0);

  function vueFactures(filtre) {
    if (filtre) filtres.factures = filtre;
    const liste = D.factures.filter(f => filtres.factures === 'toutes' || f.statut === filtres.factures);
    const aPayer = D.factures.filter(f => f.statut === 'a_payer');
    // Payé : réparti selon la source du règlement (banque / apport personnel).
    const parSource = Object.entries(SOURCES).map(([k, l]) => [l, somme(D.factures.filter(f => f.source === k).map(regle))]).filter(([, v]) => v);
    const sansSource = somme(D.factures.filter(f => !f.source).map(regle));
    if (sansSource) parSource.push(['source non précisée', sansSource]);
    return `<p class="retour"><a href="#bilan">← Bilan</a></p>
      <header class="entete"><h1>Factures</h1><button class="btn" data-action="nouvelle-facture">Ajouter une facture</button></header>
      <p class="resume">À payer : <strong>${euros(somme(aPayer.map(aRegler)))}</strong> · payé : ${euros(somme(D.factures.map(regle)))}${parSource.length ? ` (${parSource.map(([l, v]) => `${l} ${euros(v)}`).join(', ')})` : ''}</p>
      ${puces('factures', { a_payer: 'À payer', paye: 'Payées', toutes: 'Toutes' })}
      ${liste.length ? `<ul class="liste">${liste.map(ligneFacture).join('')}</ul>` : '<p class="vide">Aucune facture ici.</p>'}`;
  }

  // Reste à payer : les factures en attente, puis ce qui reste à facturer par poste.
  function vueReste() {
    const aPayer = D.factures.filter(f => f.statut === 'a_payer');
    const postes = D.postes.map(p => ({ p, b: bilanPoste(p) })).filter(({ b }) => b.devis - b.facture > 0.005);
    return `<p class="retour"><a href="#bilan">← Bilan</a></p>
      <header class="entete"><h1>Reste à payer</h1></header>
      <section class="bloc"><h2>Factures à régler · ${euros(somme(aPayer.map(aRegler)))}</h2>
        ${aPayer.length ? `<ul class="liste">${aPayer.map(ligneFacture).join('')}</ul>` : '<p class="discret">Aucune facture en attente.</p>'}</section>
      <section class="bloc"><h2>Reste à facturer · ${euros(somme(postes.map(({ b }) => b.devis - b.facture)))}</h2>
        <ul class="liste">${postes.map(({ p, b }) => `<li><a class="ligne" href="#poste/${p.id}">
          <span class="corps"><strong>${esc(p.nom)}</strong><small>${esc(p.entreprise)} · devis ${euros(b.devis)}${b.facture ? ` · déjà facturé ${euros(b.facture)}` : ''}</small></span>
          <span class="montant">${euros(b.devis - b.facture)}</span>
        </a></li>`).join('')}</ul></section>`;
  }

  const VUES = { bilan: vueBilan, postes: vuePostes, planning: vuePlanning, devis: vueDevis, factures: vueFactures, reste: vueReste };
  // Devis, factures et reste s'ouvrent depuis les cartes du Bilan.
  const SOUS_BILAN = ['devis', 'factures', 'reste'];

  function afficher() {
    const [vue, id] = (location.hash.slice(1) || 'bilan').split('/');
    const courante = vue === 'poste' ? 'postes' : VUES[vue] ? vue : 'bilan';
    $('#contenu').innerHTML = vue === 'poste' ? vuePoste(id) : VUES[courante](id);
    const menu = SOUS_BILAN.includes(courante) ? 'bilan' : courante;
    document.querySelectorAll('.barre nav a').forEach(a => a.classList.toggle('actif', a.dataset.vue === menu));
  }

  // ---------- Formulaires ----------

  function champHtml(c, v) {
    const id = 'f-' + c.nom;
    let saisie;
    if (c.type === 'select') {
      saisie = `<select id="${id}" name="${c.nom}"${c.requis ? ' required' : ''}>${c.requis ? '' : '<option value="">—</option>'}${Object.entries(c.options).map(([k, l]) =>
        `<option value="${esc(k)}"${String(v ?? '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    } else if (c.type === 'textarea') {
      saisie = `<textarea id="${id}" name="${c.nom}" rows="3">${esc(v)}</textarea>`;
    } else if (c.type === 'euros') {
      saisie = `<input id="${id}" name="${c.nom}" inputmode="decimal" autocomplete="off" value="${v == null ? '' : String(v).replace('.', ',')}">`;
    } else {
      const liste = c.liste ? `<datalist id="${id}-l">${c.liste.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
      saisie = `<input id="${id}" name="${c.nom}" type="${c.type || 'text'}" value="${esc(v)}"${c.requis ? ' required' : ''}${c.liste ? ` list="${id}-l"` : ''}>${liste}`;
    }
    return `<div class="champ${c.demi ? ' demi' : ''}"><label for="${id}">${esc(c.libelle)}</label>${saisie}</div>`;
  }

  function lire(form, champs) {
    const o = {};
    for (const c of champs) {
      const brut = form.elements[c.nom].value.trim();
      if (brut === '') { o[c.nom] = null; continue; }
      if (c.type === 'euros' || c.type === 'number') {
        const n = Number(brut.replace(/[\s €]/g, '').replace(',', '.'));
        if (Number.isNaN(n)) throw new Error(`Nombre invalide : ${c.libelle}`);
        o[c.nom] = n;
      } else {
        o[c.nom] = brut;
      }
    }
    return o;
  }

  function ouvrirFormulaire({ titre, champs, valeurs = {}, enregistrer, supprimer, complement = '' }) {
    const dlg = $('#dlg');
    dlg.innerHTML = `<form>
      <h2>${esc(titre)}</h2>
      <div class="champs">${champs.map(c => champHtml(c, valeurs[c.nom])).join('')}</div>
      ${complement}
      ${valeurs.id && valeurs.auteur ? `<p class="discret">Dernière modification par ${esc(valeurs.auteur)}</p>` : ''}
      <footer>
        ${supprimer ? '<button type="button" class="btn danger" data-role="supprimer">Supprimer</button>' : ''}
        <span class="espace"></span>
        <button type="button" class="btn" data-role="annuler">Annuler</button>
        <button type="submit" class="btn principal">Enregistrer</button>
      </footer>
    </form>`;
    const form = dlg.querySelector('form');
    const agir = async (action, texte) => {
      try {
        await action();
        dlg.close();
        await rafraichir();
        message(texte);
      } catch (e) {
        message(e.message, true);
      }
    };
    form.onsubmit = ev => { ev.preventDefault(); agir(() => enregistrer(lire(form, champs)), 'Enregistré'); };
    form.querySelector('[data-role=annuler]').onclick = () => dlg.close();
    const boutonSuppr = form.querySelector('[data-role=supprimer]');
    if (boutonSuppr) {
      boutonSuppr.onclick = () => {
        if (boutonSuppr.dataset.confirme) return agir(supprimer, 'Supprimé');
        boutonSuppr.dataset.confirme = '1';
        boutonSuppr.textContent = 'Confirmer la suppression';
      };
    }
    dlg.showModal();
    return form;
  }

  function formPoste(v) {
    ouvrirFormulaire({
      titre: v.id ? 'Modifier le poste' : 'Nouveau poste',
      valeurs: v,
      champs: [
        { nom: 'nom', libelle: 'Poste', requis: true },
        { nom: 'entreprise', libelle: 'Entreprise', liste: entreprises(), demi: true },
        { nom: 'statut', libelle: 'Statut', type: 'select', options: STATUTS_POSTE, requis: true, demi: true },
        { nom: 'contact', libelle: 'Contact', demi: true },
        { nom: 'telephone', libelle: 'Téléphone', type: 'tel', demi: true },
        { nom: 'email', libelle: 'E-mail', type: 'email', demi: true },
        { nom: 'ordre', libelle: 'N° du poste', type: 'number', demi: true },
        { nom: 'notes', libelle: 'Notes', type: 'textarea' },
      ],
      enregistrer: async x => {
        if (v.id) return db.modifier('postes', v.id, x);
        // Un nouveau poste arrive au planning avec son intervention, à dater.
        const [p] = await db.ajouter('postes', x);
        await db.ajouter('taches', { titre: p.nom, responsable: p.entreprise || NOUS, poste_id: p.id, statut: 'a_faire', ordre: prochainOrdre() });
      },
      supprimer: v.id && (async () => { await db.supprimer('postes', v.id); location.hash = '#postes'; }),
    });
  }

  function formDevis(v) {
    const historique = v.id ? D.devis_historique.filter(h => h.devis_id === v.id) : [];
    const libChamp = { montant_estimatif: 'estimatif', montant_valide: 'validé' };
    const complement = v.id ? `<div class="historique">
        <p>Montant initial : <strong>${euros(v.montant_initial)}</strong></p>
        ${historique.length ? `<ul>${historique.map(h => `<li>${date(h.modifie_le.slice(0, 10))} · ${libChamp[h.champ]} : ${euros(h.ancien)} → ${euros(h.nouveau)}${h.auteur ? ` · ${esc(h.auteur)}` : ''}</li>`).join('')}</ul>` : ''}
      </div>` : '';
    ouvrirFormulaire({
      titre: v.id ? `Devis ${v.numero || ''}` : 'Nouveau devis',
      valeurs: v,
      complement,
      champs: [
        { nom: 'poste_id', libelle: 'Poste', type: 'select', options: optionsPostes() },
        { nom: 'numero', libelle: 'Numéro', demi: true },
        { nom: 'entreprise', libelle: 'Entreprise', liste: entreprises(), demi: true },
        { nom: 'date_devis', libelle: 'Date du devis', type: 'date', demi: true },
        { nom: 'date_validite', libelle: 'Valable jusqu\'au', type: 'date', demi: true },
        { nom: 'statut', libelle: 'Statut', type: 'select', options: STATUTS_DEVIS, requis: true, demi: true },
        { nom: 'acompte_pct', libelle: 'Acompte demandé (%)', type: 'number', demi: true },
        { nom: 'montant_ht', libelle: 'Montant HT', type: 'euros', demi: true },
        { nom: 'montant_estimatif', libelle: 'Montant estimatif TTC', type: 'euros', demi: true },
        { nom: 'montant_valide', libelle: 'Montant validé TTC', type: 'euros', demi: true },
        { nom: 'date_validation', libelle: 'Date de validation', type: 'date', demi: true },
        { nom: 'notes', libelle: 'Notes', type: 'textarea' },
      ],
      enregistrer: x => {
        if (x.statut === 'valide') {
          x.montant_valide = x.montant_valide ?? x.montant_estimatif;
          x.date_validation = x.date_validation ?? aujourdhui();
        }
        return v.id ? db.modifier('devis', v.id, x) : db.ajouter('devis', x);
      },
      supprimer: v.id && (() => db.supprimer('devis', v.id)),
    });
  }

  function formFacture(v) {
    const optionsDevis = Object.fromEntries(D.devis.map(d => [d.id, `${d.numero || 'Sans numéro'} – ${d.entreprise || ''}`]));
    const form = ouvrirFormulaire({
      titre: v.id ? `Facture ${v.numero || ''}` : 'Nouvelle facture',
      valeurs: v,
      champs: [
        { nom: 'numero', libelle: 'Numéro', demi: true },
        { nom: 'date_facture', libelle: 'Date', type: 'date', demi: true },
        { nom: 'devis_id', libelle: 'Devis lié', type: 'select', options: optionsDevis },
        { nom: 'poste_id', libelle: 'Poste', type: 'select', options: optionsPostes(), demi: true },
        { nom: 'entreprise', libelle: 'Entreprise', liste: entreprises(), demi: true },
        { nom: 'montant_ht', libelle: 'Montant HT', type: 'euros', demi: true },
        { nom: 'tva', libelle: 'TVA (€)', type: 'euros', demi: true },
        { nom: 'montant_ttc', libelle: 'Montant TTC', type: 'euros', demi: true },
        { nom: 'statut', libelle: 'Statut', type: 'select', options: STATUTS_FACTURE, requis: true, demi: true },
        { nom: 'source', libelle: 'Payé par', type: 'select', options: SOURCES, demi: true },
        { nom: 'date_reglement', libelle: 'Date du règlement', type: 'date', demi: true },
        { nom: 'montant_regle', libelle: 'Montant réglé', type: 'euros', demi: true },
        { nom: 'notes', libelle: 'Notes', type: 'textarea' },
      ],
      enregistrer: x => {
        const d = x.devis_id && trouve('devis', x.devis_id);
        if (d) {
          x.poste_id = x.poste_id ?? d.poste_id;
          x.entreprise = x.entreprise ?? d.entreprise;
        }
        if (x.montant_ttc == null && x.montant_ht != null) x.montant_ttc = arrondi(x.montant_ht + (x.tva || 0));
        if (x.montant_ttc == null) throw new Error('Indiquer le montant TTC (ou le HT et la TVA).');
        if (x.statut === 'paye') {
          x.montant_regle = x.montant_regle ?? x.montant_ttc;
          x.date_reglement = x.date_reglement ?? aujourdhui();
        }
        return v.id ? db.modifier('factures', v.id, x) : db.ajouter('factures', x);
      },
      supprimer: v.id && (() => db.supprimer('factures', v.id)),
    });
    // TTC = HT + TVA dès que les deux sont saisis.
    const lireEuros = n => Number(form.elements[n].value.replace(/[\s €]/g, '').replace(',', '.'));
    const calculer = () => {
      const ht = lireEuros('montant_ht'), tva = lireEuros('tva');
      if (form.elements.montant_ht.value && form.elements.tva.value && !Number.isNaN(ht + tva)) {
        form.elements.montant_ttc.value = String(arrondi(ht + tva)).replace('.', ',');
      }
    };
    form.elements.montant_ht.oninput = calculer;
    form.elements.tva.oninput = calculer;
  }

  function formTache(v) {
    ouvrirFormulaire({
      titre: v.id ? 'Modifier la tâche' : 'Nouvelle tâche',
      valeurs: v,
      champs: [
        { nom: 'titre', libelle: 'Tâche', requis: true },
        { nom: 'poste_id', libelle: 'Type (poste)', type: 'select', options: optionsPostes(), demi: true },
        { nom: 'responsable', libelle: 'Qui', liste: [...AUTEURS, NOUS, ...entreprises()], demi: true },
        { nom: 'debut', libelle: 'Prévu : début', type: 'date', demi: true },
        { nom: 'fin', libelle: 'Prévu : fin ou échéance', type: 'date', demi: true },
        { nom: 'debut_reel', libelle: 'Réalisé : début', type: 'date', demi: true },
        { nom: 'fin_reelle', libelle: 'Réalisé : fin', type: 'date', demi: true },
        { nom: 'statut', libelle: 'Statut', type: 'select', options: STATUTS_TACHE, requis: true },
        {
          nom: 'apres_id', libelle: 'Après la fin de',
          type: 'select', options: Object.fromEntries(D.taches.filter(t => t.id !== v.id).map(t => [t.id, `${t.titre} (${t.responsable || NOUS})`])),
        },
        { nom: 'notes', libelle: 'Notes', type: 'textarea' },
      ],
      enregistrer: x => (v.id ? db.modifier('taches', v.id, x) : db.ajouter('taches', x)),
      supprimer: v.id && (() => db.supprimer('taches', v.id)),
    });
  }

  function formRelance(v) {
    const p = trouve('postes', v.poste_id);
    ouvrirFormulaire({
      titre: `Relance · ${p ? p.nom : ''}`,
      valeurs: v,
      champs: [
        { nom: 'date_relance', libelle: 'Date', type: 'date', requis: true, demi: true },
        { nom: 'moyen', libelle: 'Moyen', type: 'select', options: MOYENS, demi: true },
        { nom: 'reponse', libelle: 'Réponse', type: 'textarea' },
      ],
      enregistrer: async x => {
        if (v.id) return db.modifier('relances', v.id, x);
        await db.ajouter('relances', { ...x, poste_id: v.poste_id });
        if (p && p.statut === 'a_contacter') await db.modifier('postes', p.id, { statut: 'relance' });
      },
      supprimer: v.id && (() => db.supprimer('relances', v.id)),
    });
  }

  // Sur PC, première ouverture : qui est devant l'écran ?
  function demanderAuteur(retenir) {
    const dlg = $('#dlg');
    dlg.innerHTML = `<form class="qui">
      <h2>Qui utilise ce PC ?</h2>
      <p class="discret">Vos modifications seront signées de ce prénom. Tu pourras changer en bas du menu.</p>
      <footer>${AUTEURS.map(n => `<button type="button" class="btn principal" data-qui="${n}">${n}</button>`).join('')}</footer>
    </form>`;
    dlg.querySelectorAll('[data-qui]').forEach(b => {
      b.onclick = () => { dlg.close(); retenir(b.dataset.qui); };
    });
    dlg.showModal();
  }

  async function precharger() {
    const S = window.DONNEES_INITIALES;
    const postes = await db.ajouter('postes', S.postes.map((p, i) => ({ statut: 'a_contacter', ...p, ordre: i + 1 })));
    const idDe = Object.fromEntries(postes.map(p => [p.code, p.id]));
    const lier = ({ poste, ...r }) => ({ ...r, poste_id: poste ? idDe[poste] : null });
    await db.ajouter('devis', S.devis.map(d => ({ statut: 'estimatif', ...lier(d) })));
    await db.ajouter('factures', S.factures.map(lier));
    await db.ajouter('taches', S.taches.map((t, i) => ({ responsable: NOUS, statut: 'a_faire', ordre: (i + 1) * 10, ...lier(t) })));
    await db.ajouter('taches', postes.map(p => ({ titre: p.nom, responsable: p.entreprise, poste_id: p.id, statut: 'a_faire', ordre: 1000 + p.ordre * 10 })));
  }

  const prochainOrdre = () => Math.max(0, ...D.taches.map(t => t.ordre)) + 10;

  // ▲ ▼ : échange la place de deux tâches voisines dans l'enchaînement.
  async function deplacer(id, sens) {
    const liste = trierTaches(D.taches);
    const i = liste.findIndex(t => t.id === id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= liste.length) return;
    [liste[i], liste[j]] = [liste[j], liste[i]];
    try {
      for (const [k, t] of liste.entries()) {
        if (t.ordre !== (k + 1) * 10) await db.modifier('taches', t.id, { ordre: (k + 1) * 10 });
      }
    } catch (e) {
      message(e.message, true);
    }
    await rafraichir();
  }

  // ---------- Actions ----------

  const posteDe = b => trouve('postes', b.dataset.poste) || {};
  const ACTIONS = {
    precharger: async b => {
      b.disabled = true;
      try {
        await charger();
        if (!D.postes.length) await precharger();
        await rafraichir();
        message('Données du chantier chargées');
      } catch (e) {
        message(e.message, true);
        b.disabled = false;
      }
    },
    'nouveau-poste': () => formPoste({ statut: 'a_contacter', ordre: Math.max(0, ...D.postes.map(p => p.ordre)) + 1 }),
    'modifier-poste': b => formPoste(trouve('postes', b.dataset.id)),
    'nouveau-devis': b => formDevis({ statut: 'estimatif', poste_id: posteDe(b).id, entreprise: posteDe(b).entreprise }),
    devis: b => formDevis(trouve('devis', b.dataset.id)),
    'nouvelle-facture': b => formFacture({ statut: 'a_payer', date_facture: aujourdhui(), poste_id: posteDe(b).id, entreprise: posteDe(b).entreprise }),
    facture: b => formFacture(trouve('factures', b.dataset.id)),
    'nouvelle-tache': b => formTache({ statut: 'a_faire', responsable: posteDe(b).entreprise || NOUS, poste_id: posteDe(b).id, ordre: prochainOrdre() }),
    monter: b => deplacer(b.dataset.id, -1),
    descendre: b => deplacer(b.dataset.id, 1),
    tache: b => formTache(trouve('taches', b.dataset.id)),
    'nouvelle-relance': b => formRelance({ poste_id: b.dataset.poste, date_relance: aujourdhui() }),
    relance: b => formRelance(trouve('relances', b.dataset.id)),
    cocher: async b => {
      const t = trouve('taches', b.dataset.id);
      try {
        const fait = t.statut !== 'fait';
        await db.modifier('taches', t.id, fait
          ? { statut: 'fait', fin_reelle: t.fin_reelle || aujourdhui() }
          : { statut: 'a_faire' });
        await rafraichir();
      } catch (e) {
        message(e.message, true);
      }
    },
    budget: () => formBudget(),
    'ouvrir-poste': b => { location.hash = `#poste/${b.dataset.id}`; },
    filtre: b => {
      if (b.dataset.groupe === 'factures') { location.hash = `#factures/${b.dataset.valeur}`; return; }
      filtres[b.dataset.groupe] = b.dataset.valeur;
      afficher();
    },
    deconnexion: async () => { await db.deconnexion(); location.hash = ''; location.reload(); },
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || !ACTIONS[b.dataset.action]) return;
    e.preventDefault();
    ACTIONS[b.dataset.action](b);
  });
  window.addEventListener('hashchange', () => { afficher(); window.scrollTo(0, 0); });

  // Infobulle des graphiques : au survol sur PC, au toucher sur téléphone.
  const bulle = $('#infobulle');
  document.addEventListener('pointermove', e => {
    const cible = e.target.closest('[data-info]');
    bulle.hidden = !cible;
    if (!cible) return;
    bulle.textContent = cible.dataset.info;
    const largeur = bulle.offsetWidth;
    bulle.style.left = `${Math.min(Math.max(8, e.clientX - largeur / 2), innerWidth - largeur - 8)}px`;
    bulle.style.top = `${e.clientY - bulle.offsetHeight - 12}px`;
  });
  document.addEventListener('pointerleave', () => { bulle.hidden = true; });

  // ---------- Démarrage ----------

  async function demarrer() {
    $('#bandeau-demo').hidden = !db.demo;
    const session = await db.session();
    if (!session) {
      $('#connexion').hidden = false;
      $('#app').hidden = true;
      return;
    }
    vueBilan.compte = session.user.email;
    document.querySelector('.compte-email').textContent = session.user.email;
    document.querySelector('.compte').hidden = db.demo;
    const choix = $('#choix-auteur');
    choix.closest('label').hidden = appareil() !== 'PC';
    choix.value = auteur() || '';
    const retenir = qui => {
      try { localStorage.setItem('chantier-auteur', qui); } catch (e) { /* stockage indisponible */ }
      choix.value = qui;
      afficher();
    };
    choix.onchange = () => retenir(choix.value);
    if (!auteur() && !db.demo) demanderAuteur(retenir);
    $('#connexion').hidden = true;
    $('#app').hidden = false;
    await rafraichir();
  }

  $('#voir-mdp').onclick = () => {
    const champ = $('#c-mdp');
    const visible = champ.type === 'password';
    champ.type = visible ? 'text' : 'password';
    $('#voir-mdp').textContent = visible ? 'Masquer' : 'Afficher';
    $('#voir-mdp').setAttribute('aria-pressed', String(visible));
  };

  $('#form-connexion').onsubmit = async e => {
    $('#c-mdp').type = 'password';
    e.preventDefault();
    const f = e.target;
    const erreur = $('#erreur-connexion');
    erreur.textContent = '';
    try {
      await db.connexion(f.email.value.trim(), f.mdp.value);
      // La connexion ne change pas de page : on signale la réussite au navigateur
      // pour qu'il propose d'enregistrer le mot de passe (API sur Chrome/Edge,
      // changement d'adresse pour Safari).
      if (window.PasswordCredential) {
        navigator.credentials.store(new PasswordCredential({ id: f.email.value.trim(), password: f.mdp.value })).catch(() => {});
      }
      history.pushState(null, '', '#bilan');
      await demarrer();
    } catch (err) {
      erreur.textContent = /invalid login/i.test(err.message) ? 'Identifiant ou mot de passe incorrect.' : err.message;
    }
  };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js');
  }

  demarrer().catch(e => message(e.message, true));
})();
