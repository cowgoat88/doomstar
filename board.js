/*
 * Battlefield rendering shared by the game (game.js) and the AI arena (arena.js).
 *
 * Draws a tile-free SVG board: terrain shapes, charging stars, the Doomstar, ships sized by
 * their footprint, the selected ship's move and attack areas (shaped by terrain) and effects
 * for the last actions. The rules stay grid-based; clicks snap to the nearest legal spot.
 * Requires engine.js; exposes `window.DoomstarBoard`.
 */
(function (root) {
  'use strict';

  const D = root.Doomstar;
  const SNAP_TOLERANCE = 1.6;

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
    prism: '<path d="M1 0 L0 0.64 L-1 0 L0 -0.64 Z"/><path class="detail" d="M1 0 L-1 0 M0 0.64 L0 -0.64"/>',
    nova: '<path d="M0.5 -0.3 L1 -0.17 L1 0.17 L0.5 0.3 Z"/><circle r="0.74"/><circle class="detail" r="0.36"/>',
    command: `<path d="${starPath(5, 1, 0.45)}"/>`,
  };

  const px = (value) => (value + 0.5).toFixed(2);
  const num = (value) => +value.toFixed(2);

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

  function terrainMarkup(entry, kind) {
    if (entry.rect) {
      const [x, y, w, h] = entry.rect;
      return `<rect class="${kind}" x="${x}" y="${y}" width="${w}" height="${h}" rx="0.7"/>`;
    }
    const [cx, cy, r] = entry.circle;
    return `<circle class="${kind}" cx="${px(cx)}" cy="${px(cy)}" r="${r + 0.5}"/>`;
  }

  function starMarkup(state, star) {
    const holder = D.starHolder(state, star);
    const r = star.r + 0.5;
    return `<g class="star${holder ? ` held-${holder.player}` : ''}" transform="translate(${px(star.x)} ${px(star.y)})">`
      + `<circle class="star-zone" r="${r}"/><path class="star-core" d="${starPath(4, r * 0.45, r * 0.12)}"/></g>`;
  }

  function doomstarMarkup(state) {
    const zone = state.doomstar;
    const r = zone.r + 0.5;
    const inner = num(r * 0.3);
    const armed = D.PLAYERS.filter((p) => D.doomstarReady(state, p)).map((p) => ` armed-${p}`).join('');
    return `<g class="doomstar${armed}" transform="translate(${px(zone.x)} ${px(zone.y)})">`
      + `<circle class="doomstar-zone" r="${r}"/><circle class="doomstar-ring" r="${num(r * 0.6)}"/>`
      + `<path class="doomstar-cross" d="M${-r} 0H${-inner}M${inner} 0H${r}M0 ${-r}V${-inner}M0 ${inner}V${r}"/>`
      + `<circle class="doomstar-core" r="${num(r * 0.16)}"/></g>`;
  }

  // Fill and outline of the cells whose value is positive, traced between cell centres (marching
  // squares). Edges are placed by linear interpolation, so circular limits stay round.
  function areaPaths(size, values) {
    const at = (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? -1 : values[y * size + x]);
    const fill = [];
    const edge = [];
    for (let y = -1; y < size; y += 1) {
      let run = null;
      for (let x = -1; x <= size; x += 1) {
        const v = [at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)];
        const inside = v.map((value) => value > 0);
        if (inside.every(Boolean)) {
          if (run === null) run = x;
          continue;
        }
        if (run !== null) {
          fill.push(`M${run + 0.5} ${y + 0.5}h${x - run}v1h${run - x}z`);
          run = null;
        }
        if (!inside.some(Boolean)) continue;
        const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
        const points = [];
        for (let i = 0; i < 4; i += 1) {
          const j = (i + 1) % 4;
          const [ax, ay] = corners[i];
          if (inside[i]) points.push({ x: ax + 0.5, y: ay + 0.5, edge: false });
          if (inside[i] !== inside[j]) {
            const t = v[i] / (v[i] - v[j]);
            points.push({ x: ax + (corners[j][0] - ax) * t + 0.5, y: ay + (corners[j][1] - ay) * t + 0.5, edge: true });
          }
        }
        fill.push(`M${points.map((p) => `${num(p.x)} ${num(p.y)}`).join('L')}z`);
        points.forEach((p, k) => {
          const q = points[(k + 1) % points.length];
          if (p.edge && q.edge) edge.push(`M${num(p.x)} ${num(p.y)}L${num(q.x)} ${num(q.y)}`);
        });
      }
    }
    return { fill: fill.join(''), edge: edge.join('') };
  }

  function areaMarkup(cls, size, values) {
    const { fill, edge } = areaPaths(size, values);
    return `<path class="${cls}-fill" d="${fill}"/><path class="${cls}-edge" d="${edge}"/>`;
  }

  // Values for `areaPaths`: positive (distance to the limit, capped at 1) where the ship can go or hit,
  // the negative overshoot just outside the circle, and -1 where terrain or ships cut the area.
  function circleValues(state, unit, radius, isOpen) {
    const { size } = state;
    const values = new Float32Array(size * size).fill(-1);
    const span = Math.ceil(radius) + 1;
    for (let y = Math.max(0, unit.y - span); y <= Math.min(size - 1, unit.y + span); y += 1) {
      for (let x = Math.max(0, unit.x - span); x <= Math.min(size - 1, unit.x + span); x += 1) {
        const slack = radius - Math.hypot(x - unit.x, y - unit.y);
        if (slack < 0) values[y * size + x] = Math.max(-1, slack);
        else if ((x === unit.x && y === unit.y) || isOpen(x, y)) values[y * size + x] = Math.min(1, Math.max(0.05, slack));
      }
    }
    return values;
  }

  function moveArea(state, unit, moves) {
    const open = new Set(moves.map((c) => c.y * state.size + c.x));
    return areaMarkup('move-area', state.size, circleValues(state, unit, unit.move, (x, y) => open.has(y * state.size + x)));
  }

  // Where shots can land from the ship's current spot; walls cast shadows beyond close range.
  function attackArea(state, unit) {
    const isOpen = (x, y) => D.terrainAt(state, x, y) !== 'wall' && D.canFireAt(state, unit, unit.x, unit.y, x, y);
    return areaMarkup('attack-area', state.size, circleValues(state, unit, unit.radius + unit.range, isOpen));
  }

  function unitMarkup(unit, ring, facing, spent) {
    // Hulls are drawn slightly larger than their footprint so small ships stay readable.
    const r = unit.radius * 1.15;
    const badge = 0.42;
    const label = `${D.PLAYER_NAMES[unit.player]} ${D.UNIT_TYPES[unit.type].label}, ${unit.hp}/${unit.maxHp} HP`;
    return `<g class="unit ${unit.player} ${unit.type}${spent ? ' spent' : ''}" transform="translate(${px(unit.x)} ${px(unit.y)})">`
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
    const under = [`<rect class="space" width="${size}" height="${size}"/>`];
    const over = [];

    for (const star of state.stars) under.push(starMarkup(state, star));
    under.push(doomstarMarkup(state));
    for (const entry of map.asteroids) under.push(terrainMarkup(entry, 'asteroid'));
    for (const entry of map.walls) under.push(terrainMarkup(entry, 'wall'));

    if (selected) {
      if (!selected.attacked && D.canActivate(state, selected)) under.push(attackArea(state, selected));
      if (view.moves && view.moves.length) under.push(moveArea(state, selected, view.moves));
    }

    const line = (cls, from, to) => `<line class="${cls}" x1="${px(from.x)}" y1="${px(from.y)}" x2="${px(to.x)}" y2="${px(to.y)}"/>`;
    for (const e of events) {
      if (e.type === 'move') {
        under.push(line(`trail ${e.player}`, e.from, e.to));
      } else if (e.type === 'attack') {
        over.push(line(`beam ${e.player}`, e.from, e.to));
        if (e.splash) over.push(`<circle class="blast" cx="${px(e.to.x)}" cy="${px(e.to.y)}" r="${e.splash}"/>`);
      } else if (e.type === 'doomstar') {
        over.push(line('doomstar-beam', e.from, e.to));
        over.push(`<circle class="doomstar-hit" cx="${px(e.to.x)}" cy="${px(e.to.y)}" r="3.5"/>`);
      }
      if (e.type === 'attack' || e.type === 'splash' || e.type === 'doomstar') {
        over.push(`<text class="float${e.killed ? ' kill' : ''}" x="${px(e.to.x)}" y="${(e.to.y - 0.6).toFixed(2)}" font-size="1.8">${e.killed ? 'KO' : `-${e.damage}`}</text>`);
      }
    }

    const units = state.units.map((u) => {
      const ring = u === selected ? 'select-ring' : targets.has(u.id) ? 'target-ring' : '';
      return unitMarkup(u, ring, facing[u.player], isSpent(state, u));
    });
    const ghostRadius = selected ? selected.radius : 0.4;

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
    const toBoard = (event) => {
      const rect = svg.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * state.size - 0.5,
        y: ((event.clientY - rect.top) / rect.height) * state.size - 0.5,
      };
    };
    const nearestMove = (point) => {
      let best = null;
      let bestDistance = SNAP_TOLERANCE;
      for (const cell of view.moves || []) {
        const d = Math.hypot(cell.x - point.x, cell.y - point.y);
        if (d <= bestDistance) {
          best = cell;
          bestDistance = d;
        }
      }
      return best;
    };

    boardEl.onclick = (event) => {
      const point = toBoard(event);
      const unit = D.unitNear(state, point.x, point.y);
      view.onBoardClick({ ...point, unit, move: unit ? null : nearestMove(point) });
    };
    boardEl.onmousemove = (event) => {
      const point = toBoard(event);
      const cell = selected && !D.unitNear(state, point.x, point.y) ? nearestMove(point) : null;
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
    return D.PLAYERS.map((player) => {
      const command = D.commandOf(state, player);
      const maxHp = command ? command.maxHp : D.UNIT_TYPES.command.hp;
      const hp = command ? command.hp : 0;
      const ships = state.units.filter((u) => u.player === player && u.type !== 'command');
      const ready = D.doomstarReady(state, player);
      const active = !state.winner && state.currentPlayer === player ? ' active' : '';
      return `
        <div class="side-card ${player}${active}">
          <div class="side-name">${D.PLAYER_NAMES[player]}</div>
          <div class="side-stat"><span>Command</span><strong>${hp} / ${maxHp}</strong></div>
          <div class="hp-bar"><span style="width:${Math.round((100 * hp) / maxHp)}%"></span></div>
          <div class="side-stat"><span>Ships</span><strong>${ships.length}</strong></div>
          <div class="side-stat"><span>Stars held</span><strong>${D.starsHeld(state, player)} / ${state.stars.length}</strong></div>
          <div class="side-stat${ready ? ' ready' : ''}"><span>Doomstar charge</span><strong>${state.charge[player]} / ${state.rules.doomstarCharge}${ready ? ' ready' : ''}</strong></div>
          <div class="mini-row">${ships.map((u) => unitIcon(u.type, player)).join('')}</div>
        </div>`;
    }).join('');
  }

  function winnerBannerHtml(state, extra = '') {
    const title = state.winner === 'draw' ? 'Draw' : `${D.PLAYER_NAMES[state.winner]} wins`;
    const detail = D.describeEvent({ type: 'win', winner: state.winner, reason: state.winReason });
    return `<strong>${title}</strong><span>${detail}</span><span class="muted">Round ${Math.ceil(state.turn / 2)}${extra}</span>`;
  }

  // "Guards, Lancers, Prisms or Novas"
  function crewText(rules) {
    const names = rules.crew.map((type) => `${D.UNIT_TYPES[type].label}s`);
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  }

  // The Doomstar objective in three steps (rules panel and unit guide).
  function doomstarSteps(rules) {
    const crew = crewText(rules);
    return [
      `Charge: at the end of your turn, each star held by one of your ${crew} adds 1 Doomstar charge.`,
      rules.doomstarNeedsCrew
        ? `Fire: at ${rules.doomstarCharge} charge, one of your ${crew} inside the Doomstar can fire instead of attacking: ${rules.doomstarDamage} damage to the enemy Command.`
        : `Fire: at ${rules.doomstarCharge} charge the Doomstar fires by itself: ${rules.doomstarDamage} damage to the enemy Command.`,
      rules.contestedStars
        ? 'Contest: an enemy ship at close range, Scouts included, stops a star from charging and a gunner from firing.'
        : 'Contest: off. Enemy ships nearby do not stop charging or firing.',
    ];
  }

  function describeRules(rules) {
    const lines = [];
    lines.push(rules.activations
      ? `Each turn, give orders to up to ${rules.activations} ships. An ordered ship may move and attack, in either order.`
      : 'Each turn, every ship may move once and attack once, in either order.');
    if (rules.firstTurnOrders) {
      lines.push(`Player 1 opens the match with only ${rules.firstTurnOrders} order${rules.firstTurnOrders === 1 ? '' : 's'}.`);
    }
    lines.push('Ships move anywhere inside their green area, steering around walls, asteroids and enemy ships. Allies can be passed.');
    lines.push('A target is in range when its hull touches the red area. Walls block shots beyond close range; asteroids do not.');
    lines.push('Armor reduces damage taken (minimum 1). Prism beams ignore armor. Nova blasts also hit enemies close to the target.');
    lines.push(...doomstarSteps(rules));
    lines.push('Destroy the enemy Command to win.');
    lines.push(`After ${Math.ceil(rules.turnLimit / 2)} rounds the match ends in a draw.`);
    return lines;
  }

  function abilityText(rules, type) {
    const base = D.UNIT_TYPES[type].ability;
    if (type === 'command') return base;
    return rules.crew.includes(type)
      ? `${base} Doomstar crew: charges stars and fires the Doomstar.`
      : `${base} Cannot charge stars or fire the Doomstar.`;
  }

  root.DoomstarBoard = {
    SHAPES,
    renderBoard,
    unitIcon,
    renderTurnBanner,
    scoreboardHtml,
    winnerBannerHtml,
    crewText,
    doomstarSteps,
    describeRules,
    abilityText,
  };
})(window);
