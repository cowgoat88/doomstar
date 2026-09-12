/*
 * Battlefield rendering shared by the game (game.js) and the AI arena (arena.js).
 *
 * Draws a tile-free SVG board: terrain shapes, star zones, ships sized by their footprint,
 * range circles for the selected unit, and effects for the last actions. The rules stay
 * grid-based; clicks snap to the nearest legal tile. Requires engine.js; exposes `window.DoomstarBoard`.
 */
(function (root) {
  'use strict';

  const D = root.Doomstar;
  // Ship sizes on tile maps, where footprints are one tile.
  const TILE_RADIUS = { scout: 0.32, guard: 0.4, lancer: 0.34, orbiter: 0.26, prism: 0.36, nova: 0.36, command: 0.46 };

  function starPath(points, outer, inner) {
    const corners = [];
    for (let i = 0; i < points * 2; i += 1) {
      const r = i % 2 ? inner : outer;
      const angle = (Math.PI * i) / points;
      corners.push(`${(r * Math.cos(angle)).toFixed(3)} ${(r * Math.sin(angle)).toFixed(3)}`);
    }
    return `M${corners.join(' L')} Z`;
  }

  // Silhouettes in a -1..1 box pointing along +x, scaled to each ship's size.
  const SHAPES = {
    scout: '<path d="M1 0 L-0.75 0.72 L-0.35 0 L-0.75 -0.72 Z"/>',
    guard: '<path d="M0.95 0 L0.48 0.85 L-0.48 0.85 L-0.95 0 L-0.48 -0.85 L0.48 -0.85 Z"/>'
      + '<path class="detail" d="M0.45 0 L0.22 0.4 L-0.22 0.4 L-0.45 0 L-0.22 -0.4 L0.22 -0.4 Z"/>',
    lancer: '<path d="M1 0 L-0.15 0.45 L-0.95 0.2 L-0.95 -0.2 L-0.15 -0.45 Z"/><path class="detail" d="M0.85 0 L-0.7 0"/>',
    // Small science vessel: round hull, sensor ring and two solar panels.
    orbiter: '<rect class="panel" x="-0.22" y="-1" width="0.44" height="0.4" rx="0.06"/>'
      + '<rect class="panel" x="-0.22" y="0.6" width="0.44" height="0.4" rx="0.06"/>'
      + '<ellipse class="ring" rx="0.95" ry="0.32"/><circle r="0.42"/><circle class="detail" cx="0.12" r="0.15"/>',
    prism: '<path d="M1 0 L0 0.64 L-1 0 L0 -0.64 Z"/><path class="detail" d="M1 0 L-1 0 M0 0.64 L0 -0.64"/>',
    // Splash artillery: round mortar body with a short barrel.
    nova: '<path d="M0.5 -0.3 L1 -0.17 L1 0.17 L0.5 0.3 Z"/><circle r="0.74"/><circle class="detail" r="0.36"/>',
    // Command star: eight-pointed star with a glowing core.
    command: `<path d="${starPath(8, 1, 0.52)}"/><circle class="core" r="0.32"/>`,
  };

  const isField = (state) => state.metric === 'euclidean';
  const shipRadius = (state, unit) => (isField(state) ? unit.radius : TILE_RADIUS[unit.type]);
  const px = (value) => (value + 0.5).toFixed(2);

  function isSpent(state, unit) {
    if (state.winner || unit.player !== state.currentPlayer) return false;
    if (!D.canActivate(state, unit)) return true;
    return (unit.moved || unit.move === 0) && unit.attacked;
  }

  // Ships face the enemy's starting Command.
  function facingAngles(state) {
    const setup = D.MAPS[state.rules.map].setup;
    const a = setup.p1.find((s) => s.type === 'command');
    const b = setup.p2.find((s) => s.type === 'command');
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    return { p1: angle, p2: angle + 180 };
  }

  function starfield(size) {
    let seed = 20260912;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let dots = '';
    for (let i = 0; i < 120; i += 1) {
      const r = (0.015 + rand() * 0.04) * (size / 15);
      dots += `<circle class="speck" cx="${(rand() * size).toFixed(2)}" cy="${(rand() * size).toFixed(2)}" r="${r.toFixed(3)}"/>`;
    }
    return dots;
  }

  function terrainMarkup(entry, kind) {
    if (Array.isArray(entry)) {
      const [x, y] = entry;
      return `<rect class="${kind}" x="${x + 0.06}" y="${y + 0.06}" width="0.88" height="0.88" rx="0.2"/>`;
    }
    if (entry.rect) {
      const [x, y, w, h] = entry.rect;
      return `<rect class="${kind}" x="${x}" y="${y}" width="${w}" height="${h}" rx="0.7"/>`;
    }
    const [cx, cy, r] = entry.circle;
    return `<circle class="${kind}" cx="${px(cx)}" cy="${px(cy)}" r="${r + 0.5}"/>`;
  }

  // Circle on field maps, diamond on tile maps, centred on a unit.
  function rangeShape(state, unit, cls, radius) {
    const cx = unit.x + 0.5;
    const cy = unit.y + 0.5;
    if (isField(state)) return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${radius}"/>`;
    const r = radius + 0.5;
    return `<polygon class="${cls}" points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}"/>`;
  }

  function unitMarkup(state, unit, ring, facing) {
    // Hulls are drawn slightly larger than their footprint so small ships stay readable.
    const r = shipRadius(state, unit) * (isField(state) ? 1.15 : 1);
    const badge = isField(state) ? 0.42 : 0.15;
    const label = `${D.PLAYER_NAMES[unit.player]} ${D.UNIT_TYPES[unit.type].label}, ${unit.hp}/${unit.maxHp} HP`;
    return `<g class="unit ${unit.player} ${unit.type}${isSpent(state, unit) ? ' spent' : ''}" transform="translate(${px(unit.x)} ${px(unit.y)})">`
      + (ring ? `<circle class="${ring}" r="${(r + badge).toFixed(2)}"/>` : '')
      + `<g class="hull" transform="rotate(${facing.toFixed(1)}) scale(${r})">${SHAPES[unit.type]}</g>`
      + `<g class="hp" transform="translate(${(r * 0.8).toFixed(2)} ${(-r * 0.8).toFixed(2)})">`
      + `<circle r="${badge}"/><text text-anchor="middle" dy="0.36em" font-size="${(badge * 1.35).toFixed(2)}">${unit.hp}</text></g>`
      + `<title>${label}</title></g>`;
  }

  // view: { events, selectedId, moves: [{x, y}], targets: [unit], onBoardClick({ x, y, unit, move }) }
  function renderBoard(boardEl, state, view = {}) {
    const { size } = state;
    const map = D.MAPS[state.rules.map];
    const facing = facingAngles(state);
    const events = view.events || [];
    const selected = view.selectedId ? D.getUnit(state, view.selectedId) : null;
    const targets = new Set((view.targets || []).map((u) => u.id));
    const under = [];
    const over = [];

    under.push(`<rect class="space" width="${size}" height="${size}"/>`, starfield(size));
    state.stars.forEach((star) => {
      const holder = D.starHolder(state, star);
      const r = star.r ? star.r + 0.5 : 0.42;
      under.push(`<circle class="star-zone${holder ? ` held-${holder.player}` : ''}" cx="${px(star.x)}" cy="${px(star.y)}" r="${r}"/>`);
      under.push(`<circle class="star-core" cx="${px(star.x)}" cy="${px(star.y)}" r="${(r * 0.28).toFixed(2)}"/>`);
    });
    for (const entry of map.asteroids) under.push(terrainMarkup(entry, 'asteroid'));
    for (const entry of map.walls) under.push(terrainMarkup(entry, 'wall'));

    if (state.rules.cloak === 'field') {
      for (const u of state.units) {
        if (u.type === 'orbiter') under.push(rangeShape(state, u, `cloak ${u.player}`, u.field));
      }
    }
    if (selected) {
      if (view.moves && view.moves.length) under.push(rangeShape(state, selected, 'move-range', selected.move));
      if (!selected.attacked && D.canActivate(state, selected)) {
        under.push(rangeShape(state, selected, 'attack-range', (selected.radius || 0) + selected.range));
      }
    }

    for (const e of events) {
      if (e.type === 'move') {
        under.push(`<line class="trail ${e.player}" x1="${px(e.from.x)}" y1="${px(e.from.y)}" x2="${px(e.to.x)}" y2="${px(e.to.y)}"/>`);
      } else if (e.type === 'attack') {
        over.push(`<line class="beam ${e.player}" x1="${px(e.from.x)}" y1="${px(e.from.y)}" x2="${px(e.to.x)}" y2="${px(e.to.y)}"/>`);
        if (e.splash) over.push(`<circle class="blast" cx="${px(e.to.x)}" cy="${px(e.to.y)}" r="${isField(state) ? e.splash : e.splash + 0.5}"/>`);
      } else if (e.type === 'doomstar') {
        over.push(`<circle class="doomstar-hit" cx="${px(e.to.x)}" cy="${px(e.to.y)}" r="${isField(state) ? 3.5 : 0.8}"/>`);
      }
      if (e.type === 'attack' || e.type === 'splash' || e.type === 'doomstar') {
        const fontSize = isField(state) ? 1.8 : 0.45;
        over.push(`<text class="float${e.killed ? ' kill' : ''}" x="${px(e.to.x)}" y="${(e.to.y + 0.5 - fontSize * 0.6).toFixed(2)}" font-size="${fontSize}">${e.killed ? 'KO' : `-${e.damage}`}</text>`);
      }
    }

    const units = state.units.map((u) => {
      const ring = u === selected ? 'select-ring' : targets.has(u.id) ? 'target-ring' : '';
      return unitMarkup(state, u, ring, facing[u.player]);
    });
    const ghostRadius = selected ? shipRadius(state, selected) : 0.4;

    boardEl.innerHTML = `<svg class="battlefield${view.onBoardClick ? ' interactive' : ''}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Battlefield">`
      + `${under.join('')}${units.join('')}${over.join('')}<circle class="ghost" cx="-10" cy="-10" r="${ghostRadius}"/></svg>`;
    wireInput(boardEl, state, view, selected);
  }

  function wireInput(boardEl, state, view, selected) {
    if (!view.onBoardClick) {
      boardEl.onclick = null;
      boardEl.onmousemove = null;
      boardEl.onmouseleave = null;
      return;
    }
    const svg = boardEl.firstElementChild;
    const ghost = svg.querySelector('.ghost');
    const tolerance = isField(state) ? 1.6 : 0.75;
    const toBoard = (event) => {
      const rect = svg.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * state.size - 0.5,
        y: ((event.clientY - rect.top) / rect.height) * state.size - 0.5,
      };
    };
    const nearestMove = (point) => {
      let best = null;
      let bestDistance = tolerance;
      for (const cell of view.moves || []) {
        const d = Math.hypot(cell.x - point.x, cell.y - point.y);
        if (d <= bestDistance) {
          best = cell;
          bestDistance = d;
        }
      }
      return best;
    };
    const unitAtPoint = (point) => (isField(state)
      ? D.unitNear(state, point.x, point.y)
      : D.unitAt(state, Math.round(point.x), Math.round(point.y)));

    boardEl.onclick = (event) => {
      const point = toBoard(event);
      const unit = unitAtPoint(point);
      view.onBoardClick({ ...point, unit, move: unit ? null : nearestMove(point) });
    };
    boardEl.onmousemove = (event) => {
      const point = toBoard(event);
      const cell = selected && !unitAtPoint(point) ? nearestMove(point) : null;
      ghost.setAttribute('cx', cell ? cell.x + 0.5 : -10);
      ghost.setAttribute('cy', cell ? cell.y + 0.5 : -10);
    };
    boardEl.onmouseleave = () => {
      ghost.setAttribute('cx', -10);
      ghost.setAttribute('cy', -10);
    };
  }

  function unitIcon(type, player) {
    return `<svg class="unit-icon ${player}" viewBox="-1.15 -1.15 2.3 2.3" aria-hidden="true">`
      + `<g class="hull" transform="rotate(-90)">${SHAPES[type]}</g></svg>`;
  }

  function renderTurnBanner(bannerEl, state, suffix = '') {
    bannerEl.className = 'turn-banner';
    if (state.winner) {
      bannerEl.classList.add('winner');
      bannerEl.textContent = state.winner === 'draw' ? 'Draw' : `${D.PLAYER_NAMES[state.winner]} wins`;
      return;
    }
    bannerEl.classList.add(state.currentPlayer);
    const limit = D.orderLimit(state);
    const orders = limit ? ` · ${D.ordersLeft(state)} of ${limit} orders left` : '';
    bannerEl.textContent = `Round ${Math.ceil(state.turn / 2)} · ${D.PLAYER_NAMES[state.currentPlayer]}${suffix}${orders}`;
  }

  function scoreboardHtml(state) {
    const starCount = D.starCells(state).length;
    return D.PLAYERS.map((player) => {
      const command = D.commandOf(state, player);
      const maxHp = command ? command.maxHp : D.UNIT_TYPES.command.hp;
      const hp = command ? command.hp : 0;
      const units = state.units.filter((u) => u.player === player && u.type !== 'command');
      const rows = [`<div class="side-stat"><span>Units</span><strong>${units.length}</strong></div>`];
      if (state.rules.stars !== 'none') {
        rows.push(`<div class="side-stat"><span>Stars held</span><strong>${D.starsHeld(state, player)} / ${starCount}</strong></div>`);
      }
      if (state.rules.stars === 'points') {
        rows.push(`<div class="side-stat"><span>Star points</span><strong>${state.score[player]} / ${state.rules.starTarget}</strong></div>`);
      }
      if (state.rules.stars === 'doomstar') {
        rows.push(`<div class="side-stat"><span>Doomstar charge</span><strong>${state.charge[player]} / ${state.rules.doomstarCharge}</strong></div>`);
      }
      const active = !state.winner && state.currentPlayer === player ? ' active' : '';
      return `
        <div class="side-card ${player}${active}">
          <div class="side-name">${D.PLAYER_NAMES[player]}</div>
          <div class="side-stat"><span>Command</span><strong>${hp} / ${maxHp}</strong></div>
          <div class="hp-bar"><span style="width:${Math.round((100 * hp) / maxHp)}%"></span></div>
          ${rows.join('')}
          <div class="mini-row">${units.map((u) => unitIcon(u.type, player)).join('')}</div>
        </div>`;
    }).join('');
  }

  function winnerBannerHtml(state, extra = '') {
    const title = state.winner === 'draw' ? 'Draw' : `${D.PLAYER_NAMES[state.winner]} wins`;
    const detail = D.describeEvent({ type: 'win', winner: state.winner, reason: state.winReason });
    return `<strong>${title}</strong><span>${detail}</span><span class="muted">Round ${Math.ceil(state.turn / 2)}${extra}</span>`;
  }

  function describeRules(rules) {
    const field = D.MAPS[rules.map].metric === 'euclidean';
    const lines = [];
    lines.push(rules.activations
      ? `Each turn, give orders to up to ${rules.activations} units. An ordered unit may move and attack, in either order.`
      : 'Each turn, every unit may move once and attack once, in either order.');
    if (rules.firstTurnOrders) {
      lines.push(`Player 1 opens the match with only ${rules.firstTurnOrders} order${rules.firstTurnOrders === 1 ? '' : 's'}.`);
    }
    if (field) {
      lines.push('Ships move anywhere inside their green move circle, steering around walls, asteroids and enemy ships. Allies can be passed.');
      lines.push('A target is in range when its hull is inside the red attack circle.');
    } else {
      lines.push(rules.pathing
        ? `Units walk along open tiles (no diagonals). Walls${rules.asteroids === 'block' ? ', asteroids' : ''} and enemy units block movement; allies can be passed.`
        : `Units jump to any open tile within move range, even across walls${rules.asteroids === 'block' ? ' (asteroids cannot be entered)' : ''}.`);
    }
    lines.push(rules.lineOfFire === 'ranged'
      ? 'Walls block every ranged shot. Close-range attacks always land.'
      : 'Walls block Prism beams; other units shoot over walls.');
    if (rules.armor) lines.push('Armor reduces damage taken (minimum 1). Prism beams ignore armor.');
    lines.push('Nova blasts also hit every enemy inside the blast circle around the target.');
    if (rules.cloak === 'field') {
      lines.push('Orbiter field: ships inside an Orbiter\'s field can only be attacked at close range.');
    }
    if (rules.stars === 'points') {
      lines.push(`Stars: at the end of your turn, score 1 point per star you hold. First to ${rules.starTarget} points wins.`);
    } else if (rules.stars === 'doomstar') {
      lines.push(`Doomstar: at the end of your turn, gain 1 charge per star you hold. At ${rules.doomstarCharge} charge it fires for ${rules.doomstarDamage} damage on the enemy Command.`);
    }
    if (rules.stars !== 'none' && rules.contestedStars) {
      lines.push('A star does not count while an enemy ship is at close range of its holder.');
    }
    lines.push('Destroy the enemy Command to win.');
    lines.push(`After ${Math.ceil(rules.turnLimit / 2)} rounds the match ends${rules.stars === 'points' ? '; most star points wins' : ' in a draw'}.`);
    return lines;
  }

  function abilityText(rules, type) {
    switch (type) {
      case 'orbiter':
        return rules.cloak === 'field'
          ? 'Science vessel: allies inside its field can only be attacked at close range.'
          : 'Science vessel. (Cloaking field is off in this ruleset.)';
      case 'prism':
        return `Beam artillery: needs a clear lane${rules.armor ? ' and ignores armor' : ''}.`;
      case 'guard':
        return rules.armor ? 'Armored frontline defender.' : 'Frontline defender. (Armor is off in this ruleset.)';
      case 'command':
        return rules.armor ? 'The command star (armored). Lose it and the battle collapses.' : D.UNIT_TYPES.command.ability;
      default:
        return D.UNIT_TYPES[type].ability;
    }
  }

  root.DoomstarBoard = {
    SHAPES,
    renderBoard,
    unitIcon,
    renderTurnBanner,
    scoreboardHtml,
    winnerBannerHtml,
    describeRules,
    abilityText,
  };
})(window);
