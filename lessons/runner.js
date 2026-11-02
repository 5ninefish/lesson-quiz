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

  const back = document.createElement("p");
  const home = document.createElement("a");
  home.href = "/lesson-quiz/";
  home.textContent = "Back to my lessons";
  home.addEventListener("click", function (event) {
    var ref = document.referrer || "";
    var fromDash = ref.indexOf("/lesson-quiz/") !== -1 && ref.indexOf("/lessons/") === -1;
    if (!fromDash || history.length < 2) return;
    event.preventDefault();
    history.back();
  });
  back.appendChild(home);
  root.appendChild(back);
  if (!session || !session.api) {
    const note = document.createElement("p");
    note.textContent = "Sign in on the dashboard to save your work. You can still read this lesson.";
    root.appendChild(note);
  }
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
  let readings = {};

  function post(body) {
    if (!session || !session.api) return Promise.resolve({ ok: false, error: "signed_out" });
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


  function sentenceLocal_(value) {
    const text = String(value || "").trim();
    const folded = text.toLowerCase().replace(/\s+/g, " ");
    if (!text || folded.length < 12) return "";
    if (["idk", "n/a", "na", "asdf", "yes", "no", "ok", "hello", "test"].indexOf(folded) >= 0) return "";
    return text;
  }

  function hasAnyLocal_(text, words) {
    const folded = String(text || "").toLowerCase();
    for (let i = 0; i < words.length; i++) if (folded.indexOf(words[i]) >= 0) return true;
    return false;
  }

  function sameMapLocal_(got, want) {
    if (!got || typeof got !== "object") return false;
    const keys = Object.keys(want);
    for (let i = 0; i < keys.length; i++) {
      if (String(got[keys[i]] == null ? "" : got[keys[i]]) !== String(want[keys[i]])) return false;
    }
    return keys.length > 0;
  }

  function judgeInterviewLocal_(topicId, evidence) {
    const clothesWords = ["wear", "shirt", "dress", "shoe", "pants", "skirt", "blouse", "collar", "uniform", "polo", "slack", "outfit", "clothes", "clothing", "jacket"];
    if (topicId === "start") return evidence && evidence.ready === true ? { status: "met", reason: "" } : { status: "invalid", reason: "ready" };
    if (topicId === "impression") {
      if (!sameMapLocal_(evidence.sort, { contact: "do", complete: "do", clarify: "do", health: "skip", example: "do" })) return { status: "invalid", reason: "sort" };
      if (!sentenceLocal_(evidence.clothes) || !hasAnyLocal_(evidence.clothes, clothesWords)) return { status: "invalid", reason: "clothes" };
      return { status: "met", reason: "" };
    }
    if (topicId === "questions") {
      const recalls = [evidence.recall_1, evidence.recall_2, evidence.recall_3].map(sentenceLocal_);
      if (!recalls[0] || !recalls[1] || !recalls[2]) return { status: "invalid", reason: "recall" };
      const folded = recalls.map(function (item) { return item.toLowerCase(); });
      if (folded[0] === folded[1] || folded[0] === folded[2] || folded[1] === folded[2]) return { status: "invalid", reason: "recall_same" };
      const picks = [
        "Tell me a little about yourself.",
        "What are your greatest strengths?",
        "What do you consider to be your weaknesses?",
        "Tell me about a challenge you faced and how you dealt with it.",
        "Where do you see yourself in five years?",
        "Why do you want this position?",
      ];
      if (picks.indexOf(evidence.pick) < 0) return { status: "invalid", reason: "pick" };
      if (!sentenceLocal_(evidence.role)) return { status: "invalid", reason: "role" };
      if (!sentenceLocal_(evidence.duty)) return { status: "invalid", reason: "duty" };
      return { status: "met", reason: "" };
    }
    if (topicId === "star") {
      if (!sentenceLocal_(evidence.situation) || !sentenceLocal_(evidence.task) || !sentenceLocal_(evidence.action) || !sentenceLocal_(evidence.result)) return { status: "invalid", reason: "star" };
      const blob = [evidence.situation, evidence.task, evidence.action, evidence.result].join(" ").toLowerCase();
      if (blob.indexOf("english") >= 0 && blob.indexOf("small group") >= 0) return { status: "invalid", reason: "example" };
      return { status: "met", reason: "" };
    }
    if (topicId === "draft") {
      if (!sentenceLocal_(evidence.yourself)) return { status: "invalid", reason: "yourself" };
      const strength = String(evidence.strength || "").trim().toLowerCase();
      if (!sentenceLocal_(evidence.strength) || strength === "people person" || strength === "i am a people person" || strength === "hardworking") return { status: "invalid", reason: "strength" };
      if (!sentenceLocal_(evidence.weakness) || !hasAnyLocal_(evidence.weakness, ["improv", "learn", "practic", "coach", "working on", "getting better"])) return { status: "invalid", reason: "weakness" };
      return { status: "met", reason: "" };
    }
    if (topicId === "practice") {
      const scoreOk = ["1", "2", "3", "4", "5"].indexOf(String(evidence.mark)) >= 0;
      if (evidence.mode === "I have a partner") {
        if (!sentenceLocal_(evidence.partner_question)) return { status: "invalid", reason: "partner_question" };
        if (!sentenceLocal_(evidence.partner_notice) || !hasAnyLocal_(evidence.partner_notice, ["pace", "clear", "example", "eye", "rush", "slow", "mumble"])) return { status: "invalid", reason: "partner_notice" };
        if (!scoreOk) return { status: "invalid", reason: "score" };
        return { status: "met", reason: "" };
      }
      if (evidence.mode !== "I am practicing alone") return { status: "invalid", reason: "mode" };
      if (!scoreOk) return { status: "invalid", reason: "score" };
      if (!sentenceLocal_(evidence.spoken) || !hasAnyLocal_(evidence.spoken, ["because", "when", "example", "learned", "helped", "built", "measured", "taught"])) return { status: "invalid", reason: "spoken" };
      if (!sentenceLocal_(evidence.note) || !hasAnyLocal_(evidence.note, ["pace", "clear", "example", "rush", "slow", "mumble"])) return { status: "invalid", reason: "note" };
      if (!sentenceLocal_(evidence.redo)) return { status: "invalid", reason: "redo" };
      return { status: "met", reason: "" };
    }
    if (topicId === "feedback") {
      if (!sentenceLocal_(evidence.improve)) return { status: "invalid", reason: "improve" };
      const ask = sentenceLocal_(evidence.ask);
      if (!ask || (ask.indexOf("?") < 0 && !hasAnyLocal_(ask, ["what", "how", "who", "when", "where", "why"]))) return { status: "invalid", reason: "ask" };
      return { status: "met", reason: "" };
    }
    if (topicId === "wrap") {
      if (!sentenceLocal_(evidence.why) || !hasAnyLocal_(evidence.why, ["job", "hire", "scholarship", "college", "intern", "school", "work"])) return { status: "invalid", reason: "why" };
      if (!sentenceLocal_(evidence.share)) return { status: "invalid", reason: "share" };
      if (!sentenceLocal_(evidence.culture) || !hasAnyLocal_(evidence.culture, ["community", "culture", "background", "organization", "family", "experience"])) return { status: "invalid", reason: "culture" };
      if (!sentenceLocal_(evidence.apply) || !hasAnyLocal_(evidence.apply, ["qualif", "apply", "learn"])) return { status: "invalid", reason: "apply" };
      return { status: "met", reason: "" };
    }
    return { status: "invalid", reason: "unknown_topic" };
  }

  function interviewMet_(topicId) {
    const lines = {
      start: "The ready box is checked. Next, sort a first impression into Do and Skip.",
      impression: "Eye contact, a complete answer, a repeated question, and a fitting example are in Do. The disability question is in Skip, and the clothes line names something you would wear. Next is Questions.",
      questions: "Three different questions are written, and one question is prepared for a role and a duty. Next is STAR.",
      star: "The four beats are a challenge from your own life. Next is Draft.",
      draft: "About you, the strength, and the weakness are specific enough to say. Next is Practice.",
      practice: "The spoken answer, the mark, and the note are in. Next is Feedback.",
      feedback: "The change for next time and the question for the interviewer are in. Next is Wrap.",
      wrap: "The four closing answers are in, including what you would say if you applied before you met every qualification.",
    };
    return lines[topicId] || "This topic meets the rule on the page.";
  }

  function interviewMiss_(topicId, reason, evidence) {
    const sortLabels = {
      contact: "Keep eye contact",
      complete: "Answer the whole question",
      clarify: "Ask if you need the question repeated",
      health: "Employer asks about a disability when the job lists no health requirement",
      example: "Use an example that fits the question",
    };
    const sortWant = { contact: "do", complete: "do", clarify: "do", health: "skip", example: "do" };
    if (reason === "sort") {
      const sort = evidence.sort || {};
      const keys = Object.keys(sortWant);
      for (let i = 0; i < keys.length; i++) {
        const got = String(sort[keys[i]] == null ? "" : sort[keys[i]]);
        if (!got) return "\u201c" + sortLabels[keys[i]] + "\u201d is still in the card bank. The rule is that every card sits in Do or Skip. Move that card, then save this order.";
      }
      for (let i = 0; i < keys.length; i++) {
        const got = String(sort[keys[i]]);
        if (got !== sortWant[keys[i]]) {
          const pile = got === "do" ? "Do" : "Skip";
          const want = sortWant[keys[i]] === "do" ? "Do" : "Skip";
          return "You put \u201c" + sortLabels[keys[i]] + "\u201d in " + pile + ". The rule is that this card belongs in " + want + ". Move it, then save this order.";
        }
      }
    }
    const clothes = String(evidence.clothes || "").trim();
    const lines = {
      ready: "The ready box is still empty. The rule is to check it after you have read the opening and you are ready for the pre-check. Check \u201cI am ready for the pre-check,\u201d then press I'm ready.",
      clothes: clothes.length >= 12
        ? "The clothes box does not name something you would wear. The rule is to name the role and one thing you would wear there, such as a shirt or shoes. Add that, then save this order."
        : "The clothes box is still too short to count. The rule is a full sentence that names the role and one thing you would wear. Write that, then save this order.",
      recall: "At least one recall box is still too short to count. The rule is three questions you remember while the list stays closed. Finish the short box, then save this question.",
      recall_same: "Two recall boxes say the same thing. The rule is three different questions. Change the repeated one, then save this question.",
      pick: "The question menu is still on Choose, or it is not one of the six questions. The rule is to prepare one question from that menu. Choose one, then save this question.",
      role: "The role box is still too short to count. The rule is to name a role you might interview for. Write that role, then save this question.",
      duty: "The duty box is still too short to count. The rule is one qualification or duty you would look up for that role. Write that duty, then save this question.",
      star: "One of the four beats is still too short to count. The rule is a situation, a task, an action, and a result from your own life. Finish the short beat, then save the four beats.",
      example: "This story still uses the English-class small groups. The rule is that example is already used. Write a different challenge from your own life, then save the four beats.",
      yourself: "The about-you box is still too short to count. The rule is a fact and an accomplishment a stranger could follow. Add those, then save these three answers.",
      strength: "The strength is a slogan, or it is too short to count. The rule is a specific skill for a role, not \u201cpeople person\u201d or \u201chardworking.\u201d Name what you do, then save these three answers.",
      weakness: "The weakness does not say what you are already doing to get better, or it is too short to count. The rule is a real limit plus the practice you have started. Add that practice, then save these three answers.",
      mode: "The practice menu is still on Choose. The rule is to pick a partner or the empty chair before the other boxes open. Choose one, then say the answer out loud.",
      partner_question: "The partner-question box is still too short to count. The rule is to write the question your partner asked. Write that question, then press I said it out loud.",
      partner_notice: "The partner note misses pace, clarity, the example, or how you looked, or it is too short to count. The rule is a note about the speaking and the body language. Add what they noticed, then press I said it out loud.",
      score: "The mark is still on Choose. The rule is a number from 1 to 5 for pace, clarity, and the example. Choose that mark, then press I said it out loud.",
      spoken: "The words you said are too short, or they do not include a reason or an example. The rule is an answer you said out loud, with because, when, or something you learned, helped, built, measured, or taught. Write that answer, then press I said it out loud.",
      note: "Your note misses pace, clarity, or the example, or it is too short to count. The rule is a note on the speaking. Name one of those, then press I said it out loud.",
      redo: "The second try is still too short to count. The rule is to say what you changed when you said it again. Write that change, then press I said it out loud.",
      improve: "The change box is still too short to count. The rule is one specific thing you will do differently next time. Write that change, then save it.",
      ask: "The question for the interviewer is not a question yet, or it is too short to count. The rule is one question about their role. Add a question mark or a question word, then save this change.",
      why: "The first wrap answer does not connect the practice to work or school, or it is too short to count. The rule is why this practice matters for a job, school, a scholarship, or an internship. Add that, then save these four answers.",
      share: "The family or community box is still too short to count. The rule is one way you could practice this with someone else. Write that way, then save these four answers.",
      culture: "The background box does not name your community, family, experience, or the organization, or it is too short to count. The rule is a true link between their work and something you know. Add that link, then save these four answers.",
      apply: "The last wrap answer does not say you would apply or what you would learn, or it is too short to count. The rule is that you may apply before you meet every qualification, and you name how you would learn the gap. Add that, then save these four answers.",
    };
    return lines[reason] || "This answer does not meet the rule for this topic yet. Change the part the boxes are asking for, then press the button again.";
  }

  function interviewAttemptReply(topicId, evidence, body) {
    if (body && body.error === "pre_required") return "Complete the PRE on your lesson page first. Practice does not start the test.";
    const local = judgeInterviewLocal_(topicId, evidence);
    let met = local.status === "met";
    let reason = local.reason;
    if (body && body.ok && body.status === "invalid" && body.reason) {
      met = false;
      reason = body.reason;
    }
    if (body && body.ok && (body.status === "met" || body.status === "support") && local.status !== "met") met = false;
    let text = met ? interviewMet_(topicId) : interviewMiss_(topicId, reason, evidence);
    if (!body || !body.ok) text += " This reply is from the lesson. It is not stored on a cohort until the lesson is assigned.";
    return text;
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
    const reading = readings[topic.id];
    if (reading) panel.appendChild(reading.cloneNode(true));
    if (!reading && topic.teach) {
      const p = document.createElement("p");
      p.textContent = topic.teach;
      panel.appendChild(p);
    }
    if (topic.video && !(reading && reading.querySelector("video"))) {
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
    if (!reading) (topic.photos || []).forEach(function (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      const wrap = document.createElement("p");
      wrap.className = "cards";
      wrap.appendChild(img);
      panel.appendChild(wrap);
    });
    if (reading) {
      const check = document.createElement("h3");
      check.className = "check-title";
      check.textContent = "Your check";
      panel.appendChild(check);
    }
    const form = document.createElement("form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const evidence = collect(form, topic);
      post({ action: "lesson_progress", topicId: topic.id, mode: "attempt", evidence: evidence }).then(function (body) {
        form.querySelectorAll(".reply").forEach(function (old) { old.remove(); });
        const note = document.createElement("p");
        note.className = "reply";
        if (lessonId === "ment-interviews@2026-10") note.textContent = interviewAttemptReply(topic.id, evidence, body);
        else if (body.ok && (body.status === "met" || body.status === "support")) note.textContent = "That counts.";
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
    applyWhen(form);
    form.addEventListener("change", function () { applyWhen(form); });
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = topic.action || "Check";
    const support = document.createElement("button");
    support.type = "button";
    support.className = "secondary";
    support.textContent = lessonId === "ment-interviews@2026-10" ? "Ask for help" : "Continue with support";
    support.addEventListener("click", function () {
      post({ action: "lesson_progress", topicId: topic.id, mode: "support", evidence: {} }).then(function (body) {
        form.querySelectorAll(".reply").forEach(function (old) { old.remove(); });
        const note = document.createElement("p");
        note.className = "reply";
        if (lessonId === "ment-interviews@2026-10") {
          note.textContent = body.ok
            ? "This is help. It does not mark the topic done, and it does not use a test attempt."
            : "This is help. It does not mark the topic done, and it does not use a test attempt. The lesson could not store it until a cohort is assigned.";
        } else {
          note.textContent = body.ok ? "Recorded with support. This did not use a PRE or POST attempt." : "The lesson page could not save that.";
        }
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

  function applyWhen(form) {
    form.querySelectorAll("[data-when-name]").forEach(function (box) {
      const control = form.elements[box.dataset.whenName];
      const value = control ? String(control.value || "") : "";
      box.hidden = value !== box.dataset.whenIs;
    });
  }

  function renderField(field) {
    const box = document.createElement("div");
    box.className = "field";
    if (field.when && field.when.name && field.when.is) {
      box.dataset.whenName = field.when.name;
      box.dataset.whenIs = field.when.is;
      box.hidden = true;
    }
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
    if (field.type === "piles") {
      const piles = document.createElement("div");
      piles.className = "piles";
      const bank = document.createElement("div");
      bank.className = "pile bank";
      bank.dataset.pile = "";
      const doPile = document.createElement("div");
      doPile.className = "pile do";
      doPile.dataset.pile = "do";
      const skipPile = document.createElement("div");
      skipPile.className = "pile skip";
      skipPile.dataset.pile = "skip";
      function pileTitle(parent, text) {
        const title = document.createElement("h4");
        title.textContent = text;
        parent.appendChild(title);
      }
      pileTitle(bank, "Cards");
      pileTitle(doPile, "Do");
      pileTitle(skipPile, "Skip");
      function place(card, pile, value) {
        pile.appendChild(card);
        card.querySelector("input").value = value;
        card.querySelector("[data-move='do']").hidden = value === "do";
        card.querySelector("[data-move='skip']").hidden = value === "skip";
        card.querySelector("[data-move='back']").hidden = value === "";
      }
      (field.items || []).forEach(function (item) {
        const card = document.createElement("article");
        card.className = "move-card";
        card.draggable = true;
        card.dataset.key = item.key;
        const text = document.createElement("p");
        text.textContent = item.label || item.key;
        card.appendChild(text);
        const hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = field.name + "-" + item.key;
        hidden.value = "";
        card.appendChild(hidden);
        [["do", "Move to Do"], ["skip", "Move to Skip"], ["back", "Move back"]].forEach(function (pair) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.move = pair[0];
          button.textContent = pair[1];
          if (pair[0] === "back") button.hidden = true;
          button.addEventListener("click", function () {
            const target = pair[0] === "do" ? doPile : pair[0] === "skip" ? skipPile : bank;
            const value = pair[0] === "back" ? "" : pair[0];
            place(card, target, value);
          });
          card.appendChild(button);
        });
        card.addEventListener("dragstart", function (event) {
          event.dataTransfer.setData("text/plain", item.key);
          piles.dataset.drag = item.key;
        });
        bank.appendChild(card);
      });
      [bank, doPile, skipPile].forEach(function (pile) {
        pile.addEventListener("dragover", function (event) { event.preventDefault(); });
        pile.addEventListener("drop", function (event) {
          event.preventDefault();
          const key = event.dataTransfer.getData("text/plain") || piles.dataset.drag;
          const card = piles.querySelector('.move-card[data-key="' + key + '"]');
          if (!card) return;
          place(card, pile, pile.dataset.pile || "");
        });
      });
      piles.appendChild(bank);
      piles.appendChild(doPile);
      piles.appendChild(skipPile);
      box.appendChild(piles);
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
      } else if (field.type === "choices" || field.type === "piles") {
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

  const contentUrl = new URL("content.json", window.location.href);
  const readingUrl = new URL("reading.html", window.location.href);
  if (window.HOKU_READING_V) readingUrl.searchParams.set("v", window.HOKU_READING_V);
  fetch(readingUrl.toString()).then(function (res) {
    if (!res.ok) return "";
    return res.text();
  }).catch(function () { return ""; }).then(function (html) {
    if (!html) return;
    const holder = document.createElement("div");
    holder.innerHTML = html;
    holder.querySelectorAll("[data-topic]").forEach(function (node) {
      readings[node.getAttribute("data-topic")] = node;
    });
  }).then(function () {
    return fetch(contentUrl.toString());
  }).then(function (res) {
    if (!res.ok) throw new Error("content");
    return res.json();
  }).then(function (json) {
    content = json;
    title.textContent = json.title || "Lesson";
    const opening = (content.topics || [])[0];
    if (!opening) throw new Error("topics");
    paintNav(opening.id);
    showTopic(opening);
    if (!session || !session.api) return null;
    return post({ action: "lesson_state" });
  }).then(function (body) {
    if (!body || !body.ok) return;
    remote = body;
    const lesson = currentLesson();
    const resume = lesson && lesson.progress && lesson.progress.resumeTopic;
    const next = (content.topics || []).filter(function (topic) { return topic.id === resume; })[0] || content.topics[0];
    if (!next) return;
    paintNav(next.id);
    showTopic(next);
  }).catch(function () {
    const note = document.createElement("p");
    note.textContent = "This lesson could not load. Use Back to my lessons, then open it again.";
    root.appendChild(note);
  });
})();
