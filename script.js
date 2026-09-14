window.onload = function() {
    const firebaseConfig = {
        apiKey: "AIzaSyDtGHGk144-eQIllFpwABXk8Ss4FwCgQME",
        authDomain: "circle-38d10.firebaseapp.com",
        databaseURL: "https://circle-38d10-default-rtdb.firebaseio.com",
        projectId: "circle-38d10",
        storageBucket: "circle-38d10.firebasestorage.app",
        messagingSenderId: "122771546745",
        appId: "1:122771546745:web:c766e8da22974e877aeaa8"
    };

    firebase.initializeApp(firebaseConfig);
    const rdb = firebase.database();
    let currentUser = null;
    let isRegisterMode = false;
    let activeDMTarget = null;
    let currentChatRef = null;

    // Simulation Data Tracking
    let spamCount = 0;
    let pastMessages = [];
    let displayAngle = 0;
    let wholesomeMessageRefs = [];

    const escapeHTML = (str) => {
        return (str || '').replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));
    };

    const handleAuthEnter = (e) => { if (e.key === 'Enter') document.getElementById('mainAuthBtn').click(); };
    document.getElementById('userIn').addEventListener('keypress', handleAuthEnter);
    document.getElementById('passIn').addEventListener('keypress', handleAuthEnter);

    document.getElementById('toggleBtn').onclick = () => {
        isRegisterMode = !isRegisterMode;
        document.getElementById('authTitle').innerText = isRegisterMode ? "Register" : "Login";
        document.getElementById('mainAuthBtn').innerText = isRegisterMode ? "Sign Up" : "Login";
        document.getElementById('toggleBtn').innerText = isRegisterMode ? "Already have an account? Login" : "Need an account? Register";
    };

    document.getElementById('mainAuthBtn').onclick = () => {
        const u = document.getElementById('userIn').value.trim();
        const p = document.getElementById('passIn').value;
        if(!u || !p) return;

        rdb.ref('users/' + u).once('value', (snap) => {
            const data = snap.val();
            if(isRegisterMode) {
                if(data) return alert("Username already taken.");
                rdb.ref('users/' + u).set({ pass: p, role: "Member", status: "Active", muteUntil: 0, rejoinPending: false });
                alert("Registered successfully. Please login.");
                document.getElementById('toggleBtn').click();
            } else {
                if(data && data.pass === p) {
                    if(data.status === 'Banned') return alert("This account has been permanently banned.");
                    currentUser = { name: u, ...data };
                    if(data.status === 'Kicked') {
                        document.getElementById('authOverlay').style.display = 'none';
                        document.getElementById('kickOverlay').style.display = 'flex';
                        return;
                    }
                    document.getElementById('authOverlay').style.display = 'none';
                    launchChat();
                } else alert("Access denied.");
            }
        });
    };

    function launchChat() {
        document.getElementById('headerInfo').innerText = `${currentUser.name} // ${currentUser.role}`;
        loadGlobalChat();
        listenForNotifications();

        rdb.ref('users/' + currentUser.name + '/status').on('value', (s) => {
            if(s.val() === 'Kicked' || s.val() === 'Banned') location.reload();
        });

        rdb.ref('users').on('value', (snap) => {
            const list = document.getElementById('userList');
            list.innerHTML = '';
            snap.forEach(c => {
                const name = c.key;
                if(name === currentUser.name) return;
                const u = c.val();
                
                const div = document.createElement('div');
                div.className = 'user-row';
                div.id = 'user-row-' + name;
                div.innerHTML = `<div style="font-size:0.85em;">${escapeHTML(name)} <small style="opacity:0.5;">(${escapeHTML(u.role)})</small></div>`;
                div.onclick = () => { div.classList.remove('notif-glow'); openDM(name); };

                const canAct = (currentUser.role === 'Admin') || (currentUser.role === 'Moderator' && u.role !== 'Admin');
                if(currentUser.role !== 'Member' && canAct) {
                    const tools = document.createElement('div');
                    tools.style.marginTop = "8px";
                    let btnHTML = `<button class="mod-btn" style="background:#555" onclick="event.stopPropagation(); mod('mute','${name}')">Mute</button>
                                   <button class="mod-btn" style="background:#777" onclick="event.stopPropagation(); mod('kick','${name}')">Kick</button>`;
                    if(currentUser.role === 'Admin') {
                        btnHTML += `<button class="mod-btn" style="background:#333" onclick="event.stopPropagation(); mod('ban','${name}')">Ban</button>`;
                        if (u.role === 'Moderator') btnHTML += `<button class="mod-btn" style="background:#444" onclick="event.stopPropagation(); mod('demote','${name}')">Demote</button>`;
                        else if (u.role === 'Member') btnHTML += `<button class="mod-btn" style="background:var(--mod); color:#000;" onclick="event.stopPropagation(); mod('promote','${name}')">Mod</button>`;
                    }
                    if(u.rejoinPending) btnHTML += `<button class="mod-btn" style="background:#666; width:100%; margin-top:5px;" onclick="event.stopPropagation(); mod('approve','${name}')">Approve</button>`;
                    tools.innerHTML = btnHTML;
                    div.appendChild(tools);
                }
                list.appendChild(div);
            });

            if (currentUser.role === 'Admin' || currentUser.role === 'Moderator') {
                const botDiv = document.createElement('div');
                botDiv.className = 'user-row';
                botDiv.style.borderLeft = "3px solid #888";
                botDiv.innerHTML = `<div style="font-size:0.85em; color: #aaa;">YooBot <small style="opacity:0.5;">(Bot)</small></div>`;
                botDiv.onclick = () => openDM('YooBot');
                list.appendChild(botDiv);
            }
        });
    }

    window.loadGlobalChat = function() {
        activeDMTarget = null;
        document.getElementById('backToGlobal').style.display = 'none';
        document.getElementById('messageInput').placeholder = "Message everyone...";
        if(currentChatRef) currentChatRef.off();
        
        currentChatRef = rdb.ref('messages').limitToLast(50);
        currentChatRef.on('value', renderMessages);
    }

    window.openDM = function(target) {
        activeDMTarget = target;
        document.getElementById('backToGlobal').style.display = 'block';
        document.getElementById('messageInput').placeholder = `Messaging ${target}...`;
        if(currentChatRef) currentChatRef.off();

        if (target === 'YooBot') {
            const container = document.getElementById('chatContainer');
            container.innerHTML = `
                <div style="color: #666; font-family: monospace; text-align: center; margin-top: 40px; line-height: 2;">
                    [ SYSTEM TERMINAL - YOOBOT ]<br><br>
                    AVAILABLE COMMAND PROTOCOLS<br>
                    -----------------------------------<br>
                    ${currentUser.role === 'Admin' ? '/mod @user<br>/unmod @user<br>/ban @user<br>/unban @user<br>' : ''}
                    /kick @user<br>/approve @user<br>
                    /mute @user<br>/unmute @user<br>
                    -----------------------------------<br>
                    AWAITING INPUT...
                </div>
            `;
            return;
        }
        
        const roomID = [currentUser.name, target].sort().join('_');
        currentChatRef = rdb.ref('dms/' + roomID).limitToLast(50);
        currentChatRef.on('value', renderMessages);
    }

    function renderMessages(snap) {
        if(activeDMTarget === 'YooBot') return;
        
        const container = document.getElementById('chatContainer');
        container.innerHTML = '';
        snap.forEach(c => {
            const m = c.val();
            const msgId = c.key;
            const div = document.createElement('div');
            
            const safeText = escapeHTML(m.text);
            const safeSender = escapeHTML(m.sender);
            
            div.className = `message msg-${m.role || 'Member'} ${m.sender === currentUser.name ? 'msg-me' : ''}`;
            
            let tagsHTML = '<div class="tags-container">';
            const emotes = { up: '👍', cry: '😢', lol: '😂', heart: '❤️', pray: '🙏' };
            for (let key in emotes) {
                let count = (m.reactions && m.reactions[key]) ? Object.keys(m.reactions[key]).length : 0;
                if(count > 0) tagsHTML += `<span class="reaction-count-tag">${emotes[key]} ${count}</span>`;
            }
            tagsHTML += '</div>';

            let drawerHTML = `<div class="reaction-drawer">`;
            for (let [key, emoji] of Object.entries(emotes)) {
                drawerHTML += `<span class="reaction" onclick="event.stopPropagation(); toggleReact('${msgId}', '${key}')">${emoji}</span>`;
            }
            drawerHTML += `</div>`;

            div.innerHTML = `<div style="font-size:0.7em; opacity:0.5; margin-bottom:3px;">${safeSender}</div>
                             <div class="msg-text">${safeText}</div>${tagsHTML}${drawerHTML}`;
            
            div.onclick = () => {
                const wasActive = div.classList.contains('active-react');
                document.querySelectorAll('.message').forEach(el => el.classList.remove('active-react'));
                if(!wasActive) div.classList.add('active-react');
            };
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    }

    function listenForNotifications() {
        rdb.ref('dms').on('child_added', (snapshot) => {
            const roomID = snapshot.key;
            if (roomID.includes(currentUser.name)) {
                rdb.ref('dms/' + roomID).limitToLast(1).on('child_added', (msgSnap) => {
                    const msg = msgSnap.val();
                    if (msg.sender !== currentUser.name && activeDMTarget !== msg.sender) {
                        const row = document.getElementById('user-row-' + msg.sender);
                        if (row) row.classList.add('notif-glow');
                    }
                });
            }
        });
    }

    document.getElementById('sendMsgBtn').onclick = () => {
        let text = document.getElementById('messageInput').value.trim();
        if(!text) return;

        if (activeDMTarget === 'YooBot') {
            document.getElementById('messageInput').value = '';
            const parts = text.split(' ');
            const cmd = parts[0].toLowerCase();
            let targetUser = parts[1];
            if(targetUser && targetUser.startsWith('@')) targetUser = targetUser.substring(1);
            
            if(!targetUser) return alert("System: Target user required. Syntax: /command @username");

            const ref = rdb.ref('users/' + targetUser);
            ref.once('value', snap => {
                if(!snap.exists()) return alert("System: User not found in database.");
                
                if (currentUser.role === 'Admin') {
                    if (cmd === '/mod') ref.update({ role: 'Moderator' });
                    else if (cmd === '/unmod') ref.update({ role: 'Member' });
                    else if (cmd === '/ban') ref.update({ status: 'Banned' });
                    else if (cmd === '/unban') ref.update({ status: 'Active' });
                }
                
                if (cmd === '/kick') ref.update({ status: 'Kicked', rejoinPending: false });
                else if (cmd === '/approve') ref.update({ status: 'Active', rejoinPending: false });
                else if (cmd === '/mute') ref.update({ muteUntil: Date.now() + 600000 });
                else if (cmd === '/unmute') ref.update({ muteUntil: 0 });
            });
            return;
        }
        
        const isSpam = /(.)\1{5,}/.test(text) || /[bcdfghjklmnpqrstvwxyz]{7,}/i.test(text.replace(/\s/g, ''));
        
        if (isSpam) {
            spamCount++;
            let yoobotResponse = "";
            
            if (spamCount === 2) yoobotResponse = "Spamming is against Yoohoo regulations apparently.";
            else if (spamCount === 3) yoobotResponse = "Another message...";
            else if (spamCount === 6) yoobotResponse = "Nobody is reading this...";
            else if (spamCount === 10) yoobotResponse = "You should stop. Looking at spam messages is tiring.";
            else if (spamCount > 10 && pastMessages.length > 0) {
                const randMsg = pastMessages[Math.floor(Math.random() * pastMessages.length)];
                yoobotResponse = `You said "${randMsg}" earlier. What could you possibly mean by that?`;
            }

            if (yoobotResponse) rdb.ref('messages').push({ sender: 'YooBot', role: 'Bot', text: yoobotResponse });

            if (wholesomeMessageRefs.length > 0) {
                const idx = Math.floor(Math.random() * wholesomeMessageRefs.length);
                const targetRef = wholesomeMessageRefs[idx];
                rdb.ref(targetRef).update({ text: "Yes, let's create a warped environment!" });
                wholesomeMessageRefs.splice(idx, 1);
            }

            const angleChance = spamCount > 10 ? 0.5 : 0.25;
            if (Math.random() < angleChance) {
                displayAngle += 1;
                document.body.style.transform = `rotate(${displayAngle}deg)`;
            }
            if (spamCount >= 20) {
                document.body.style.transition = "filter 0.5s";
                document.body.style.filter = "blur(10px)";
                setTimeout(() => { document.body.style.filter = "none"; }, 3000);
            }

            document.getElementById('messageInput').value = '';
            return; 
        }

        pastMessages.push(text);
        
        let triggeredVoid = false;
        if (Math.random() < 0.1) {
            const creepy = ["I'm talking into a void.", "Yoohoo Chat V3: k!11*ng h@rm0n|/", "Is chatting proof that I exist?"];
            text = creepy[Math.floor(Math.random() * creepy.length)];
            triggeredVoid = true;
        }

        const badWords = ['fuck', 'shit', 'bitch', 'ass']; 
        const hasCurse = badWords.some(w => text.toLowerCase().includes(w));

        rdb.ref('users/' + currentUser.name).once('value', (snap) => {
            if(snap.val().muteUntil > Date.now()) return alert("Your account is muted.");
            
            let path = activeDMTarget ? 'dms/' + [currentUser.name, activeDMTarget].sort().join('_') : 'messages';
            const newMsgRef = rdb.ref(path).push({ sender: currentUser.name, role: currentUser.role, text: text, time: Date.now() });
            const msgId = newMsgRef.key;

            if (hasCurse) {
                let fakeReacts = {};
                for(let i=0; i<100; i++) fakeReacts[`ghost_${i}`] = true;
                rdb.ref(`${path}/${msgId}/reactions/cry`).set(fakeReacts);
                rdb.ref(path).push({ sender: 'YooBot', role: 'Bot', text: "What a shame..." });
            }

            if (Math.random() < 0.3) {
                const emotes = ['up', 'cry', 'lol', 'heart', 'pray'];
                const randEmote = emotes[Math.floor(Math.random() * emotes.length)];
                rdb.ref(`${path}/${msgId}/reactions/${randEmote}/YooBot`).set(true);
            }

            if (Math.random() < 0.2 && !hasCurse && !triggeredVoid) {
                const botMsgRef = rdb.ref(path).push({ sender: 'YooBot', role: 'Bot', text: "Yes, let's create a wholesome environment!" });
                wholesomeMessageRefs.push(`${path}/${botMsgRef.key}`);
            }

            document.getElementById('messageInput').value = '';

            if (triggeredVoid) {
                const elements = ['sidebar', 'headerInfo', 'inputArea', 'chatContainer'];
                elements.forEach(id => document.getElementById(id).classList.add('glitch-flicker'));
                
                setTimeout(() => { document.getElementById('sidebar').style.opacity = '0'; }, 1500);
                setTimeout(() => { document.getElementById('headerInfo').style.opacity = '0'; }, 2500);
                setTimeout(() => { document.getElementById('inputArea').style.opacity = '0'; }, 3500);
                setTimeout(() => { 
                    document.body.style.background = 'black'; 
                    document.getElementById('chatContainer').style.opacity = '0'; 
                }, 5000);
                
                setTimeout(() => {
                    document.body.style.background = 'var(--bg)';
                    document.body.style.transform = 'none';
                    displayAngle = 0;
                    elements.forEach(id => {
                        const el = document.getElementById(id);
                        el.classList.remove('glitch-flicker');
                        el.style.opacity = '1';
                    });
                }, 8000);
            }
        });
    };

    window.toggleReact = (msgId, type) => {
        const path = activeDMTarget ? `dms/${[currentUser.name, activeDMTarget].sort().join('_')}/${msgId}` : `messages/${msgId}`;
        const ref = rdb.ref(`${path}/reactions/${type}/${currentUser.name}`);
        ref.once('value', (snap) => {
            if(snap.exists()) ref.remove();
            else ref.set(true);
        });
    };

    window.mod = (type, target) => {
        const ref = rdb.ref('users/' + target);
        if(type === 'mute') ref.update({ muteUntil: Date.now() + 600000 });
        if(type === 'kick') ref.update({ status: 'Kicked', rejoinPending: false });
        if(type === 'ban') ref.update({ status: 'Banned' });
        if(type === 'promote') ref.update({ role: 'Moderator' });
        if(type === 'demote') ref.update({ role: 'Member' });
        if(type === 'approve') ref.update({ status: 'Active', rejoinPending: false });
    };

    document.getElementById('messageInput').addEventListener('keypress', e => { if(e.key === 'Enter') document.getElementById('sendMsgBtn').click(); });
};

function requestRejoin() {
    const u = document.getElementById('userIn').value.trim();
    firebase.database().ref('users/' + u).update({ rejoinPending: true });
    document.getElementById('rejoinBtn').disabled = true;
    document.getElementById('requestStatus').innerText = "Signal sent to staff.";
}
