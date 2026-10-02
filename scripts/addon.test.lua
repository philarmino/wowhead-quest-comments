-- Run with Lua 5.1: loads the actual TOC files using minimal WoW widget stubs.
local objects = {}
local Widget = {}
Widget.__index = Widget
local function widget(parent)
    local w = setmetatable({parent=parent, scripts={}, shown=true, width=460, height=390, children={}}, Widget)
    objects[#objects+1] = w
    if parent then parent.children[#parent.children+1] = w end
    return w
end
for name in ("SetPoint SetFrameStrata SetClampedToScreen EnableMouse SetMovable SetResizable SetResizeBounds RegisterForDrag SetBackdrop SetBackdropColor SetBackdropBorderColor ClearAllPoints SetJustifyH SetJustifyV SetWordWrap SetNormalTexture SetHighlightTexture SetPushedTexture SetColorTexture UpdateScrollChildRect SetVerticalScroll SetFrameLevel RegisterForClicks SetTexture SetVertexColor RegisterEvent UnregisterEvent StartMoving StopMovingOrSizing StartSizing"):gmatch('%S+') do Widget[name]=function() end end
function Widget:SetSize(w,h) self.width=w; self.height=h end
function Widget:SetWidth(w) self.width=w end
function Widget:SetHeight(h) self.height=h end
function Widget:GetWidth() return self.width end
function Widget:GetHeight() return self.height end
function Widget:GetFrameLevel() return 1 end
function Widget:GetCenter() return 0,0 end
function Widget:GetEffectiveScale() return 1 end
function Widget:Show() self.shown=true end
function Widget:Hide() self.shown=false end
function Widget:IsShown() return self.shown end
function Widget:SetShown(v) self.shown=v end
function Widget:SetText(s) self.text=s end
function Widget:SetTextColor(r,g,b) self.textColor={r,g,b} end
function Widget:GetStringHeight() return 20 end
function Widget:SetScrollChild(child) self.scrollChild=child end
function Widget:CreateFontString() return widget(self) end
function Widget:CreateTexture() return widget(self) end
function Widget:SetScript(event,callback) self.scripts[event]=callback end
function Widget:HookScript(event,callback) self.scripts[event]=callback end
function CreateFrame(kind,name,parent) local w=widget(parent); if name then _G[name]=w end; return w end
UIParent=widget(); Minimap=widget(); SlashCmdList={}; GameTooltip=widget()
local active=13943
C_SuperTrack={GetSuperTrackedQuestID=function() return active end}
local ns={}
for line in io.lines('addon/WowheadQuestComments.toc') do
    if line:match('%.lua$') then
        assert(loadfile('addon/' .. line))('WowheadQuestComments', ns)
    end
end
for _,obj in ipairs(objects) do if obj.scripts.OnEvent then obj.scripts.OnEvent(obj,'ADDON_LOADED','WowheadQuestComments') end end
local function context()
    return WowheadQuestCommentsFrame.children[2].text
end
local checked = 0
local function expectQuest(id, comments)
    assert(context():find('Quest '..id..'  ·  '..#comments..' comments',1,true), context())
    local visible = {}
    for _,obj in ipairs(objects) do
        if obj.body and obj.shown then visible[#visible+1] = obj end
    end
    assert(#visible == #comments, 'Wrong number of visible comment rows')
    for i,comment in ipairs(comments) do
        assert(visible[i].body.text == comment.text, 'Wrong rendered comment text')
        assert(visible[i].author.text == comment.author, 'Wrong rendered author')
    end
    checked = checked + 1
end
local run = SlashCmdList.WOWHEADQUESTCOMMENTS
local db = ns.db
assert(type(db) == 'table' and #db[13943] == 2, 'Missing real quest 13943 data')
assert(type(ns.dataBuild) == 'string' and #ns.dataBuild == 12, 'Missing data build ID')

-- All generated quests must render their actual texts through the real handler.
for id,comments in pairs(db) do
    assert(type(id) == 'number', 'Generator emitted a non-numeric key')
    run(tostring(id))
    expectQuest(id, comments)
end
for _,cmd in ipairs({'13943','preview 13943','quest 13943','  preview 13943  '}) do
    run(cmd)
    expectQuest(13943, db[13943])
end
run('preview')
expectQuest(2, db[2])
run('2')
expectQuest(2, db[2])

-- Reproduce the reported difference between preview and explicit numeric IDs.
local textKeys = {}
for id,comments in pairs(db) do textKeys[tostring(id)] = comments end
ns.db = textKeys
run('preview')
expectQuest(2, db[2])
run('2')
expectQuest(2, db[2])
for id,comments in pairs(db) do
    run('preview '..id)
    expectQuest(id, comments)
end

-- Tracking and the minimap must use the same lookup, for both key formats.
for _,database in ipairs({db, textKeys}) do
    ns.db = database
    active = 13943
    WowheadQuestCommentsFrame:Hide()
    WowheadQuestCommentsMinimapButton.scripts.OnClick(WowheadQuestCommentsMinimapButton)
    expectQuest(13943, db[13943])
end

-- Missing database is a load error, not a quest with zero comments.
ns.db = nil
run('13943')
assert(context():find('Comment database not loaded',1,true))
ns.db = db
run('26467')
expectQuest(26467, {})
run('999999999')
expectQuest(999999999, {})
active = 0
WowheadQuestCommentsFrame:Hide()
run('')
assert(context():find('No active quest',1,true))

-- Diagnostics run in the actual addon's closure and distinguish data/key types.
local messages, originalPrint = {}, print
print = function(text) messages[#messages+1] = text end
run('debug 13943')
assert(messages[1]:find('Core 0.2.3',1,true))
assert(messages[1]:find(ns.dataBuild,1,true))
assert(messages[1]:find('Numeric/text IDs 166/0',1,true))
assert(messages[2]:find('Quest 13943 | Entry present | Comments 2',1,true))
local before = context()
run('nonsense 13943')
assert(context() == before, 'Invalid command silently changed displayed quest')
print = originalPrint
print('PASS: '..checked..' Lua 5.1 display checks, real TOC/data/Core, numeric and text keys, minimap, errors and diagnostics.')
