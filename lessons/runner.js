(function () {
  const root = document.getElementById("app");
  const lessonId = window.HOKU_LESSON;
  const session = readSession();

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem("hokulani-lesson-session") || "null"); }
    catch (e) { return null; }
  }

  function say(text) {
    root.textContent = "";
    const p = document.createElement("p");
    p.textContent = text;
    root.appendChild(p);
  }

  if (!session || session.lessonId !== lessonId || !session.api) {
    say("Open this lesson from your program page after you sign in.");
    return;
  }

  const back = document.createElement("p");
  const home = document.createElement("a");
  home.href = "/lesson-quiz/?program=" + encodeURIComponent(session.programId);
  home.textContent = "Back to my lessons";
  back.appendChild(home);
  root.appendChild(back);
  const title = document.createElement("h1");
  title.textContent = "Lesson";
  root.appendChild(title);
  const nav = document.createElement("nav");
  root.appendChild(nav);
  const panel = document.createElement("section");
  panel.className = "topic";
  root.appendChild(panel);

  let content = null;
  let remote = null;

  function post(body) {
    return fetch(session.api, {
      method: "POST",
      body: JSON.stringify(Object.assign({
        username: session.username,
        password: session.password,
        programId: session.programId,
        lessonId: lessonId,
      }, body)),
      redirect: "follow",
    }).then(function (res) { return res.json(); });
  }

  function currentLesson() {
    const lessons = remote && remote.lessons || [];
    for (let i = 0; i < lessons.length; i++) {
      if (lessons[i] && lessons[i].lessonId === lessonId) return lessons[i];
    }
    return null;
  }

  function topicState(id) {
    const lesson = currentLesson();
    const topics = lesson && lesson.topics || [];
    for (let i = 0; i < topics.length; i++) if (topics[i].id === id) return topics[i];
    return { status: "" };
  }

  function showTopic(topic) {
    panel.textContent = "";
    const h = document.createElement("h2");
    h.textContent = topic.title;
    panel.appendChild(h);
    const state = topicState(topic.id);
    if (state.status === "met" || state.status === "support") {
      const done = document.createElement("p");
      done.className = "note";
      done.textContent = state.status === "support" ? "Saved with support. This did not use a test attempt." : "Saved.";
      panel.appendChild(done);
    }
    if (topic.teach) {
      const p = document.createElement("p");
      p.textContent = topic.teach;
      panel.appendChild(p);
    }
    if (topic.video) {
      const video = document.createElement("video");
      video.controls = true;
      video.src = topic.video;
      if (topic.vtt) {
        const track = document.createElement("track");
        track.kind = "captions";
        track.label = "English";
        track.src = topic.vtt;
        video.appendChild(track);
      }
      panel.appendChild(video);
      if (topic.transcript) {
        const link = document.createElement("p");
        const a = document.createElement("a");
        a.href = topic.transcript;
        a.textContent = "Transcript";
        link.appendChild(a);
        panel.appendChild(link);
      }
    }
    (topic.photos || []).forEach(function (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      const wrap = document.createElement("p");
      wrap.className = "cards";
      wrap.appendChild(img);
      panel.appendChild(wrap);
    });
    const form = document.createElement("form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const evidence = collect(form, topic);
      post({ action: "lesson_progress", topicId: topic.id, mode: "attempt", evidence: evidence }).then(function (body) {
        const note = document.createElement("p");
        if (body.ok && (body.status === "met" || body.status === "support")) note.textContent = "That counts.";
        else if (body.ok) note.textContent = "Saved. You can continue with support if you want a person to review it.";
        else if (body.error === "pre_required") note.textContent = "Complete the PRE on your lesson page first. Practice does not start the test.";
        else note.textContent = "Look again at this topic, then try once more.";
        form.appendChild(note);
        if (body.lesson) {
          remote.lessons = [body.lesson];
          paintNav(topic.id);
        }
      });
    });
    (topic.fields || []).forEach(function (field) { form.appendChild(renderField(field)); });
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Check";
    const support = document.createElement("button");
    support.type = "button";
    support.className = "secondary";
    support.textContent = "Continue with support";
    support.addEventListener("click", function () {
      post({ action: "lesson_progress", topicId: topic.id, mode: "support", evidence: {} }).then(function (body) {
        const note = document.createElement("p");
        note.textContent = body.ok ? "Recorded with support. This did not use a PRE or POST attempt." : "The lesson page could not save that.";
        form.appendChild(note);
        if (body.lesson) {
          remote.lessons = [body.lesson];
          paintNav(topic.id);
        }
      });
    });
    form.appendChild(submit);
    form.appendChild(document.createTextNode(" "));
    form.appendChild(support);
    panel.appendChild(form);
    post({ action: "lesson_progress", topicId: topic.id, mode: "place", evidence: {} }).catch(function () {});
  }

  function addSelect(parent, name, options, labelText) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const select = document.createElement("select");
    select.name = name;
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Choose";
    select.appendChild(blank);
    (options || []).forEach(function (option) {
      const node = document.createElement("option");
      node.value = option;
      node.textContent = option;
      select.appendChild(node);
    });
    label.appendChild(select);
    parent.appendChild(label);
  }

  function addText(parent, name, labelText, long) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = long ? document.createElement("textarea") : document.createElement("input");
    if (!long) input.type = "text";
    input.name = name;
    label.appendChild(input);
    parent.appendChild(label);
  }

  function renderField(field) {
    const box = document.createElement("div");
    if (field.type === "ready") {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "ready";
      label.appendChild(input);
      label.appendChild(document.createTextNode(field.label || " I have read the route"));
      box.appendChild(label);
      return box;
    }
    if (field.type === "text" || field.type === "number") {
      const label = document.createElement("label");
      label.textContent = field.label || field.name;
      const input = field.long ? document.createElement("textarea") : document.createElement("input");
      input.name = field.name;
      if (!field.long) input.type = field.type === "number" ? "number" : "text";
      label.appendChild(input);
      box.appendChild(label);
      return box;
    }
    if (field.type === "select") {
      addSelect(box, field.name, field.options, field.label || field.name);
      return box;
    }
    if (field.type === "lines") {
      for (let i = 0; i < (field.count || 3); i++) addText(box, field.name + "-" + i, (field.label || "Step") + " " + (i + 1), false);
      return box;
    }
    if (field.type === "choices") {
      (field.items || []).forEach(function (item) {
        addSelect(box, field.name + "-" + item.key, item.options, item.label || item.key);
      });
      return box;
    }
    if (field.type === "rank") {
      (field.items || []).forEach(function (_item, index) {
        addSelect(box, field.name + "-" + index, field.items, (field.label || "Order") + " " + (index + 1));
      });
      return box;
    }
    if (field.type === "draw") {
      addSelect(box, "puzzle", ["square", "hexagon", "pattern"], "Puzzle");
      addSelect(box, "prediction", ["starts-at-dot", "other"], "Where does the square path start?");
      addText(box, "times", "Repeat count", false);
      addText(box, "move", "Move length", false);
      addText(box, "turn", "Turn", false);
      addText(box, "explanation", "What did you change?", true);
      return box;
    }
    if (field.type === "parts") {
      addText(box, "until", "Loop until", false);
      addText(box, "body", "Loop body, separated by commas", false);
      addText(box, "iff", "If", false);
      addText(box, "then", "Then, separated by commas", false);
      addText(box, "changes", "What changes with a longer leaf?", true);
      addText(box, "stays", "What stays the same?", true);
      return box;
    }
    if (field.type === "app") {
      [1, 2, 3].forEach(function (n) {
        addText(box, "title-" + n, "Screen " + n + " title", false);
        addText(box, "body-" + n, "Screen " + n + " text", true);
        addText(box, "a-label-" + n, "Button A label", false);
        addText(box, "a-to-" + n, "Button A goes to screen", false);
        addText(box, "b-label-" + n, "Button B label, if you need one", false);
        addText(box, "b-to-" + n, "Button B goes to screen", false);
      });
      addText(box, "walk", "Preview taps: screen,button,landed separated by semicolons", false);
      addText(box, "explanation", "One connection you chose", true);
      return box;
    }
    return box;
  }

  function valueOf(form, name) {
    const node = form.querySelector('[name="' + name + '"]');
    return node ? String(node.value || "") : "";
  }

  function collect(form, topic) {
    const evidence = {};
    (topic.fields || []).forEach(function (field) {
      if (field.type === "ready") {
        const box = form.querySelector('[name="ready"]');
        evidence.ready = !!(box && box.checked);
      } else if (field.type === "number") {
        evidence[field.name] = Number(valueOf(form, field.name));
      } else if (field.type === "text" || field.type === "select") {
        evidence[field.name] = valueOf(form, field.name);
      } else if (field.type === "lines") {
        const steps = [];
        for (let i = 0; i < (field.count || 3); i++) steps.push(valueOf(form, field.name + "-" + i));
        evidence[field.name] = steps;
      } else if (field.type === "choices") {
        const map = {};
        (field.items || []).forEach(function (item) { map[item.key] = valueOf(form, field.name + "-" + item.key); });
        evidence[field.name] = map;
      } else if (field.type === "rank") {
        const order = [];
        (field.items || []).forEach(function (_item, index) { order.push(valueOf(form, field.name + "-" + index)); });
        evidence[field.name] = order;
      } else if (field.type === "draw") {
        const times = Number(valueOf(form, "times"));
        const move = Number(valueOf(form, "move"));
        const turn = Number(valueOf(form, "turn"));
        evidence.puzzle = valueOf(form, "puzzle");
        evidence.prediction = valueOf(form, "prediction");
        evidence.explanation = valueOf(form, "explanation");
        evidence.program = [{ op: "repeat", times: times, body: [{ op: "move", n: move }, { op: "turn", n: turn }] }];
      } else if (field.type === "parts") {
        evidence.changes = valueOf(form, "changes");
        evidence.stays = valueOf(form, "stays");
        evidence.program = {
          loop: { until: valueOf(form, "until"), body: valueOf(form, "body").split(",").map(function (part) { return part.trim(); }).filter(Boolean) },
          conditional: { "if": valueOf(form, "iff"), then: valueOf(form, "then").split(",").map(function (part) { return part.trim(); }).filter(Boolean) },
        };
      } else if (field.type === "app") {
        evidence.screens = [1, 2, 3].map(function (n) {
          const screen = {
            title: valueOf(form, "title-" + n),
            body: valueOf(form, "body-" + n),
            a_label: valueOf(form, "a-label-" + n),
            a_to: Number(valueOf(form, "a-to-" + n)),
          };
          const backLabel = valueOf(form, "b-label-" + n);
          const backTo = valueOf(form, "b-to-" + n);
          if (backLabel || backTo) {
            screen.b_label = backLabel;
            screen.b_to = Number(backTo);
          }
          return screen;
        });
        evidence.walk = valueOf(form, "walk").split(";").map(function (part) {
          const bits = part.split(",");
          return { screen: Number(bits[0]), button: String(bits[1] || "").trim(), landed: Number(bits[2]) };
        }).filter(function (step) { return step.screen && step.button; });
        evidence.explanation = valueOf(form, "explanation");
      }
    });
    return evidence;
  }

  function setPath(obj, path, value) {
    const parts = String(path).split(".");
    let cursor = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const next = parts[i + 1];
      if (!cursor[key]) cursor[key] = /^\d+$/.test(next) ? [] : {};
      cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = value;
  }

  function paintNav(current) {
    nav.textContent = "";
    (content.topics || []).forEach(function (topic) {
      const button = document.createElement("button");
      button.type = "button";
      const state = topicState(topic.id);
      button.textContent = topic.title + (state.status === "met" || state.status === "support" ? " ✓" : "");
      if (topic.id === current) button.setAttribute("aria-current", "true");
      button.addEventListener("click", function () { showTopic(topic); paintNav(topic.id); });
      nav.appendChild(button);
    });
  }

  fetch("./content.json").then(function (res) { return res.json(); }).then(function (json) {
    content = json;
    title.textContent = json.title || "Lesson";
    return post({ action: "lesson_state" });
  }).then(function (body) {
    remote = body && body.ok ? body : { lessons: [] };
    const lesson = currentLesson();
    const resume = lesson && lesson.progress && lesson.progress.resumeTopic;
    const first = (content.topics || []).filter(function (topic) { return topic.id === resume; })[0] || content.topics[0];
    paintNav(first.id);
    showTopic(first);
  }).catch(function () {
    say("This lesson could not load. Open it again from your program page.");
  });
})();
