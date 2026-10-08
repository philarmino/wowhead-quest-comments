local addonName, ns = ...
local CORE_BUILD = "0.2.4"
local settings

local GOLD = "|cffffd27a"
local MUTED = "|cff9ca3ad"
-- Field order of each comment in Data.lua, written by scripts/pipeline.ts generateLua.
local AUTHOR, SCORE, DATE, TEXT = 1, 2, 3, 4

local commentFrame = CreateFrame("Frame", "WowheadQuestCommentsFrame", UIParent, "BackdropTemplate")
commentFrame:SetSize(460, 390)
commentFrame:SetPoint("CENTER")
commentFrame:SetFrameStrata("DIALOG")
commentFrame:SetClampedToScreen(true)
commentFrame:EnableMouse(true)
commentFrame:SetMovable(true)
commentFrame:SetResizable(true)
commentFrame:SetResizeBounds(330, 240, 900, 700)
commentFrame:RegisterForDrag("LeftButton")
commentFrame:SetScript("OnDragStart", commentFrame.StartMoving)
commentFrame:SetBackdrop({
    bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
    edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile = true,
    tileSize = 16,
    edgeSize = 18,
    insets = { left = 4, right = 4, top = 4, bottom = 4 }
})
commentFrame:SetBackdropColor(0.045, 0.055, 0.075, 0.97)
commentFrame:SetBackdropBorderColor(0.55, 0.43, 0.24, 0.9)
commentFrame:Hide()

local function SaveWindowGeometry()
    if not settings then
        return
    end

    local x, y = commentFrame:GetCenter()
    local parentX, parentY = UIParent:GetCenter()
    settings.windowX = x - parentX
    settings.windowY = y - parentY
    settings.windowWidth = math.floor(commentFrame:GetWidth() + 0.5)
    settings.windowHeight = math.floor(commentFrame:GetHeight() + 0.5)
end

commentFrame:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    SaveWindowGeometry()
end)

local title = commentFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
title:SetPoint("TOPLEFT", 25, -27)
title:SetText("Quest comments")

local context = commentFrame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
context:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -8)
context:SetJustifyH("LEFT")
context:SetWidth(360)

local closeButton = CreateFrame("Button", nil, commentFrame, "UIPanelCloseButton")
closeButton:SetPoint("TOPRIGHT", -8, -8)
closeButton:SetScript("OnClick", function()
    commentFrame:Hide()
end)

local resizeButton = CreateFrame("Button", nil, commentFrame)
resizeButton:SetSize(20, 20)
resizeButton:SetPoint("BOTTOMRIGHT", -7, 7)
resizeButton:SetNormalTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Up")
resizeButton:SetHighlightTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Highlight")
resizeButton:SetPushedTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Down")
resizeButton:SetScript("OnMouseDown", function()
    commentFrame:StartSizing("BOTTOMRIGHT")
end)
resizeButton:SetScript("OnMouseUp", function()
    commentFrame:StopMovingOrSizing()
    SaveWindowGeometry()
end)

local scrollFrame = CreateFrame("ScrollFrame", nil, commentFrame, "UIPanelScrollFrameTemplate")
scrollFrame:SetPoint("TOPLEFT", 25, -94)
scrollFrame:SetPoint("BOTTOMRIGHT", -43, 23)

local headerDivider = commentFrame:CreateTexture(nil, "ARTWORK")
headerDivider:SetColorTexture(1, 1, 1, 0.1)
headerDivider:SetPoint("TOPLEFT", scrollFrame, "TOPLEFT", 0, 8)
headerDivider:SetPoint("TOPRIGHT", scrollFrame, "TOPRIGHT", -36, 8)
headerDivider:SetHeight(1)

local scrollChild = CreateFrame("Frame", nil, scrollFrame)
scrollChild:SetWidth(365)
scrollChild:SetHeight(1)
scrollFrame:SetScrollChild(scrollChild)

local emptyText = commentFrame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
emptyText:SetPoint("CENTER", scrollFrame, "CENTER", 0, 0)
emptyText:SetWidth(335)
emptyText:SetJustifyH("CENTER")

local rows = {}
local shownQuestID

local function GetRow(index)
    if rows[index] then
        return rows[index]
    end

    local row = CreateFrame("Frame", nil, scrollChild)
    row:SetWidth(355)

    row.author = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    row.author:SetTextColor(0.61, 0.64, 0.69)
    row.author:SetPoint("TOPLEFT", row, "TOPLEFT", 0, 0)
    row.author:SetWidth(270)
    row.author:SetJustifyH("LEFT")
    row.author:SetWordWrap(false)

    row.date = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    local font, size, flags = row.author:GetFont()
    row.date:SetFont(font, math.max(8, size - 1), flags)
    row.date:SetTextColor(1, 0.82, 0)
    row.date:SetPoint("LEFT", row.author, "RIGHT", 8, 0)
    row.date:SetJustifyH("LEFT")
    row.date:SetWordWrap(false)

    row.score = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    row.score:SetPoint("TOPRIGHT", row, "TOPRIGHT", 0, 0)
    row.score:SetWidth(70)
    row.score:SetJustifyH("RIGHT")

    row.body = row:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    row.body:SetPoint("TOPLEFT", row, "TOPLEFT", 0, -25)
    row.body:SetWidth(355)
    row.body:SetJustifyH("LEFT")
    row.body:SetJustifyV("TOP")
    row.body:SetWordWrap(true)

    row.divider = row:CreateTexture(nil, "ARTWORK")
    row.divider:SetColorTexture(1, 1, 1, 0.1)
    row.divider:SetPoint("BOTTOMLEFT", row, "BOTTOMLEFT", 0, 0)
    row.divider:SetPoint("BOTTOMRIGHT", row, "BOTTOMRIGHT", 0, 0)
    row.divider:SetHeight(1)

    rows[index] = row
    return row
end

local function LayoutRows()
    context:SetWidth(math.max(200, commentFrame:GetWidth() - 100))
    emptyText:SetWidth(math.max(200, scrollFrame:GetWidth() - 30))

    local contentWidth = math.max(200, scrollFrame:GetWidth() - 36)
    scrollChild:SetWidth(contentWidth + 10)

    local y = 4
    for _, row in ipairs(rows) do
        if row:IsShown() then
            row:SetWidth(contentWidth)
            row.author:SetWidth(0)
            local dateWidth = row.date:GetStringWidth()
            local dateSpace = dateWidth > 0 and dateWidth + 8 or 0
            row.author:SetWidth(math.max(1, math.min(row.author:GetStringWidth(), contentWidth - 85 - dateSpace)))
            row.body:SetWidth(contentWidth)
            row:ClearAllPoints()
            row:SetPoint("TOPLEFT", scrollChild, "TOPLEFT", 0, -y)
            row:SetHeight(25 + math.max(1, row.body:GetStringHeight()) + 20)
            y = y + row:GetHeight()
        end
    end

    scrollChild:SetHeight(math.max(1, y))
    scrollFrame:UpdateScrollChildRect()
end

commentFrame:SetScript("OnSizeChanged", LayoutRows)

local function GetComments(questID)
    if type(ns.db) ~= "table" then
        return nil
    end
    local id = tonumber(questID)
    if not id or id <= 0 or id % 1 ~= 0 then
        return nil
    end
    -- Preview receives a database key; commands and tracking supply numbers.
    -- Accept both numeric and textual keys through the same lookup.
    local comments = ns.db[id] or ns.db[tostring(id)]
    return type(comments) == "table" and comments or nil
end

local function ShowComments(questID)
    for _, row in ipairs(rows) do
        row:Hide()
    end

    scrollFrame:SetVerticalScroll(0)
    shownQuestID = questID

    if type(ns.db) ~= "table" then
        context:SetText(MUTED .. "Comment database not loaded|r")
        emptyText:SetText("The comment database could not be loaded. Run /wqc debug for details.")
        emptyText:Show()
        scrollFrame:Hide()
    elseif not questID or questID == 0 then
        context:SetText(MUTED .. "No active quest|r")
        emptyText:SetText("Set a quest as active to see its comments.")
        emptyText:Show()
        scrollFrame:Hide()
    else
        local comments = GetComments(questID)
        local count = comments and #comments or 0
        context:SetText(MUTED .. "Quest " .. questID .. "  ·  " .. count .. " comments|r")

        if count == 0 then
            emptyText:SetText("No comments have been saved for this quest yet.")
            emptyText:Show()
            scrollFrame:Hide()
        else
            emptyText:Hide()
            scrollFrame:Show()

            for index, comment in ipairs(comments) do
                local row = GetRow(index)
                row.author:SetText(comment[AUTHOR] or "Unknown")
                -- Preserve the source calendar date without converting time zones.
                local writtenDate = comment[DATE]
                row.date:SetText(type(writtenDate) == "string" and writtenDate or "")
                local score = tonumber(comment[SCORE]) or 0
                row.score:SetText(GOLD .. (score > 0 and "+" or "") .. tostring(score) .. "|r")
                row.body:SetText(comment[TEXT] or "")
                row.divider:SetShown(index < count)
                row:Show()
            end
        end
    end

    commentFrame:Show()
    LayoutRows()
end

local function GetActiveQuestID()
    if C_SuperTrack and C_SuperTrack.GetSuperTrackedQuestID then
        return C_SuperTrack.GetSuperTrackedQuestID()
    end
end

local function ToggleComments()
    if commentFrame:IsShown() then
        commentFrame:Hide()
    else
        ShowComments(GetActiveQuestID())
    end
end

local tracker = CreateFrame("Frame")
tracker:RegisterEvent("SUPER_TRACKING_CHANGED")
tracker:SetScript("OnEvent", function(_, event)
    if event ~= "SUPER_TRACKING_CHANGED" or not commentFrame:IsShown() then
        return
    end
    local questID = GetActiveQuestID()
    if questID ~= shownQuestID then
        ShowComments(questID)
    end
end)

local minimapButton = CreateFrame("Button", "WowheadQuestCommentsMinimapButton", Minimap)
minimapButton:SetSize(32, 32)
minimapButton:SetFrameStrata("MEDIUM")
minimapButton:SetFrameLevel(Minimap:GetFrameLevel() + 8)
minimapButton:RegisterForClicks("LeftButtonUp")
minimapButton:RegisterForDrag("LeftButton")

local buttonBackground = minimapButton:CreateTexture(nil, "BACKGROUND")
buttonBackground:SetTexture("Interface\\Minimap\\UI-Minimap-Background")
buttonBackground:SetSize(30, 30)
buttonBackground:SetPoint("CENTER")

local buttonIcon = minimapButton:CreateTexture(nil, "ARTWORK")
buttonIcon:SetTexture("Interface\\ChatFrame\\UI-ChatIcon-Chat-Up")
buttonIcon:SetSize(23, 23)
buttonIcon:SetPoint("CENTER", 0, 1)

local buttonBorder = minimapButton:CreateTexture(nil, "OVERLAY")
buttonBorder:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
buttonBorder:SetSize(52, 52)
buttonBorder:SetPoint("TOPLEFT", minimapButton, "TOPLEFT", 1, -1)

local directionX = -0.70710678
local directionY = -0.70710678

local function UpdateMinimapPosition()
    local radius = math.min(Minimap:GetWidth(), Minimap:GetHeight()) / 2 + 8
    minimapButton:ClearAllPoints()
    minimapButton:SetPoint("CENTER", Minimap, "CENTER", directionX * radius, directionY * radius)
end

local function UpdateDirectionFromCursor()
    local cursorX, cursorY = GetCursorPosition()
    local scale = Minimap:GetEffectiveScale()
    local centerX, centerY = Minimap:GetCenter()
    local deltaX = cursorX / scale - centerX
    local deltaY = cursorY / scale - centerY
    local distance = math.sqrt(deltaX * deltaX + deltaY * deltaY)

    if distance > 0 then
        directionX = deltaX / distance
        directionY = deltaY / distance
        UpdateMinimapPosition()
    end
end

UpdateMinimapPosition()
Minimap:HookScript("OnSizeChanged", UpdateMinimapPosition)

minimapButton:SetScript("OnMouseDown", function(self)
    self.wasDragged = false
end)
minimapButton:SetScript("OnClick", function(self)
    if not self.wasDragged then
        ToggleComments()
    end
end)
minimapButton:SetScript("OnDragStart", function(self)
    self.wasDragged = true
    GameTooltip:Hide()
    UpdateDirectionFromCursor()
    self:SetScript("OnUpdate", UpdateDirectionFromCursor)
end)
minimapButton:SetScript("OnDragStop", function(self)
    self:SetScript("OnUpdate", nil)
    UpdateDirectionFromCursor()
    if settings then
        settings.minimapX = directionX
        settings.minimapY = directionY
    end
end)
minimapButton:SetScript("OnEnter", function(self)
    buttonIcon:SetVertexColor(1, 0.85, 0.55)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:SetText("Wowhead Quest comments")
    GameTooltip:AddLine("Show comments for the active quest", 1, 1, 1)
    GameTooltip:AddLine("Drag to move the button around the minimap", 0.7, 0.7, 0.7)
    GameTooltip:Show()
end)
minimapButton:SetScript("OnLeave", function()
    buttonIcon:SetVertexColor(1, 1, 1)
    GameTooltip:Hide()
end)

local loader = CreateFrame("Frame")
loader:RegisterEvent("ADDON_LOADED")
loader:SetScript("OnEvent", function(self, _, loadedAddon)
    if loadedAddon ~= addonName then
        return
    end

    WowheadQuestCommentsSettings = WowheadQuestCommentsSettings or {}
    settings = WowheadQuestCommentsSettings

    if type(settings.minimapX) == "number" and type(settings.minimapY) == "number" then
        local distance = math.sqrt(settings.minimapX ^ 2 + settings.minimapY ^ 2)
        if distance > 0 then
            directionX = settings.minimapX / distance
            directionY = settings.minimapY / distance
        end
    end
    UpdateMinimapPosition()

    local width = math.max(330, math.min(900, tonumber(settings.windowWidth) or 460))
    local height = math.max(240, math.min(700, tonumber(settings.windowHeight) or 390))
    commentFrame:SetSize(width, height)
    commentFrame:ClearAllPoints()
    commentFrame:SetPoint("CENTER", UIParent, "CENTER", tonumber(settings.windowX) or 0, tonumber(settings.windowY) or 0)
    self:UnregisterEvent("ADDON_LOADED")
end)

SLASH_WOWHEADQUESTCOMMENTS1 = "/wqc"
local function PrintDiagnostics(questID)
    local numbers, strings = 0, 0
    if type(ns.db) == "table" then
        for key in pairs(ns.db) do
            if type(key) == "number" then numbers = numbers + 1 end
            if type(key) == "string" then strings = strings + 1 end
        end
    end
    local id = questID or 13943
    local comments = GetComments(id)
    print("WQC Core " .. CORE_BUILD .. " | Data " .. tostring(ns.dataBuild or "no build ID")
        .. " | DB " .. type(ns.db) .. " | Numeric/text IDs " .. numbers .. "/" .. strings)
    print("WQC Quest " .. id .. " | Entry " .. (comments and "present" or "missing")
        .. " | Comments " .. (comments and #comments or 0)
        .. " | Active quest " .. tostring(GetActiveQuestID()))
end

SlashCmdList.WOWHEADQUESTCOMMENTS = function(message)
    message = (message or ""):match("^%s*(.-)%s*$")
    if message == "debug" or message:match("^debug%s") then
        PrintDiagnostics(tonumber(message:match("^debug%s+(%d+)$")))
        return
    end
    if message == "preview" then
        local sampleQuestID
        if type(ns.db) == "table" then
            for id in pairs(ns.db) do
                local comments = GetComments(id)
                if comments and #comments > 0 and (not sampleQuestID or tonumber(id) < sampleQuestID) then
                    sampleQuestID = tonumber(id)
                end
            end
        end
        ShowComments(sampleQuestID)
        return
    end

    local requestedQuestID = tonumber(message:match("^(%d+)$")
        or message:match("^preview%s+(%d+)$") or message:match("^quest%s+(%d+)$"))
    if requestedQuestID and requestedQuestID > 0 then
        ShowComments(requestedQuestID)
    elseif message == "" then
        ToggleComments()
    else
        print("WQC: /wqc, /wqc <QuestID>, /wqc preview [QuestID], /wqc debug [QuestID]")
    end
end
