class MainClass{
    constructor(){

    }
    static start(){
        LocalDB.connect();
        MainClass.initMessage();
        TimeoutManager.setReadMessageTimeoutOnce(2);
        Utility.scrollToBott();
        //刚开始处理的完全是操作界面.监控输入文字产生的滑动事件以及删除文字的keyup事件调整输入框的高度.监控点击发送按钮事件使发送的信息写入到队列中.
        EventManager.monitorScrollAndKeyUpAndPressButtonActionByUser();
        //将往上滑动且至顶部事件单独拎出来,监控该事件得到历史聊天记录,完全从本地数据库拉数据.
        // EventManager.monitorScrollUpAndToTheRoofActionByUser();
        //这里是得取信息的接口.参数10代表10秒,表明我是每10秒对服务器做一次问询看是否有新信息.如果对方是离线状态的话,则将这个timeout清除.
        TimeoutManager.setReadMessageTimeout(10);
        LocalDB.when_create_event_happening();
        EventManager.monitorWindowScrollToFindWhetherGotToTop();
    }
    static initMessage(){
        LocalDB.transaction_read().then(
            function(messages){
                if(!messages || messages.length < 1){
                    return;
                }
                messages = messages.reverse();
                messages.forEach(
                    function(message){
                        if(message.userId == meId){
                            HelperManager.makeMeTextToHtml(message);
                        }else{
                            HelperManager.makeHimTextToHtml(message);
                        }
                    }
                );
            }
        );
    }
    static firstStep_getNewMessageFromServerAndInsertToIndexedDB(){
        LocalDB.getLastMessageFromIndexedDB().then(
            function(messages){
                if(messages.length > 0){
                    newestMessageDate = messages[0].createdAt;
                }else{
                    newestMessageDate = null;
                }
                const dealingTheNewMessageResponse = function(data){
                    if(data.messages.length > 0){
                        LocalDB.transaction_batch_write({"messagesToIDB":data.messages});
                        TimeoutManager.beActiveTime();
                    }else{
                        idleTimeCount++;
                        TimeoutManager.beIdleTime();
                        return;
                    }
                }
                const dealingTheNewMessageFailingResponse = function(data){
                    alert("出现了一点问题,请稍后再试一下,抱歉!");
                    return;
                }
                let _address_;
                if(newestMessageDate){
                    _address_ = messageDBaddress + "?newestMessageDate=" + newestMessageDate;
                }else{
                    _address_ = messageDBaddress;
                }
                Utility.askData(
                    {
                        "isAsync":true,
                        "method":"GET",
                        "address":_address_,
                        "susCallback":dealingTheNewMessageResponse,
                        "errorCallback":dealingTheNewMessageFailingResponse
                    }
                );
            }
        );
    }
    static secondStep_pressSendButtonAndSendTheMessage(){
        Utility.animateSendButton();
        const text = document.querySelector("textarea").value.trim();
        if(text == "") {
            return;
        }
        TimeoutManager.beActiveTime();
        const data = Utility.makeTextToHtml({"message":text},"me");
        document.querySelector("textarea").value = "";
        LocalDB.transaction_write({"messageToIDB":{"createdAt":data.createdTime,"message":data.text,"chatId":chatId,"userId":meId,"isWaitingForsent":true}})
        if(!setSendMessageTimeoutStart){
            setSendMessageTimeoutStart = true;
            //这里是发送信息的接口.参数5代表5秒,表明我是每5秒对服务器发送一次写入操作,主要考虑到用户有可能短时间发送很多消息.如果7秒到了,但是消息队列里面是空的,则将这个timeout清除.
            TimeoutManager.setSendMessageTimeout(5);
        }
    }
    static secondStep2_backgroundAsyncSendToServer(messages){

    }
    static thirdStep_scrollToTopToreadHistoryMessage(){

    }
}

class LocalDB{
    constructor(){

    }
    static when_create_event_happening(){
        db.messages.hook("creating", function (primKey, obj, trans) {
            if (obj.message != "" && obj.userId == himId){
                obj.createdAt = obj.createdAt.slice(0,19);
                HelperManager.makeHimTextToHtml(obj);
            }
            if (obj.message != "" && obj.userId == meId){
                obj.createdAt = obj.createdAt.slice(0,19);
                HelperManager.makeMeTextToHtml(obj);
            }
        });
    }
    static getLastMessageFromIndexedDB(){
        if(db){
            let lastHimMessagePromise = db.messages.where('userId')
                                        .equalsIgnoreCase(himId)
                                        .reverse() 
                                        .sortBy("createdAt");
            return lastHimMessagePromise;
        }
    }
    static connect(keywordParams={}){
        db = new Dexie("ChatRoom");
        //仅仅userId是indexKey,id是primaryKey.普通的字段有message和isSavedToServer和isWaitingForsent
        db.version(1).stores({
            messages: "++id,userId,createdAt",
        }); 
        db.version(2).stores({
            messages: "++id,userId,createdAt,chatId",
        }); 
    }
    static count(keywordParams={}){
        db.messages.toCollection().count(function (count) {
            console.log(count);
        });
    }
    static transaction_read(keywordParams={}){
        if(alreadyToTop != true){
            let resultMessages;
            if(roofMessageFromLocalDBCreatedAt){
                resultMessages = db.messages
                                      .where("chatId")
                                      .equalsIgnoreCase(chatId)
                                      .filter(
                                        function(message){
                                            return message.createdAt < roofMessageFromLocalDBCreatedAt;
                                        }
                                      )
                                      .reverse()
                                      .limit(10)
                                      .sortBy("createdAt")
                return resultMessages.then(
                    function(messages){
                        if(!messages || messages.length > 0){
                            roofMessageFromLocalDBCreatedAt = messages[messages.length-1].createdAt;
                            return messages;
                        }else{
                            alreadyToTop = true;
                            return [];
                        }
                    }
                );
            }
            if(roofMessageFromLocalDBCreatedAt == null){
                resultMessages = db.messages
                                   .where("chatId")
                                   .equalsIgnoreCase(chatId)
                                   .reverse()
                                   .limit(10)
                                   .sortBy("createdAt")
                return resultMessages.then(
                    function(messages){
                        if(!messages || messages.length > 0){
                            roofMessageFromLocalDBCreatedAt = messages[messages.length-1].createdAt;
                            return messages;
                        }else{
                            alreadyToTop = true;
                            return [];
                        }
                    }
                );
            }
        }   
    }
    static if_have_unsent_messages(){
        return db.messages.where("chatId")
                          .equalsIgnoreCase(chatId)
                          .filter(
                             function(message){
                                 return message.isWaitingForsent == true;
                             }
                          )
                          .limit(10)
                          .sortBy("createdAt");
    }
    static write_unsent_messages_local_to_server(resultMessages){
        resultMessages.then(
            function(messages){
                if(!messages || messages.length < 1){
                    return null;
                }
                const sentingMessagesSus = messages.map(function(message){
                    message.isWaitingForsent=false;
                    return message;
                });
                const sentingMessagesFail = messages.map(function(message){
                    message.isWaitingForsent=false;
                    message.isSavedToServer=false;
                    return message;
                });
                const stringifyMessages = 'messages=' + encodeURIComponent(JSON.stringify(messages));
                //成功的话,将信息中的待发送的状态改为false
                const sentSusCallback = function(data){
                    LocalDB.transaction_batch_update({"messagesToIDB":sentingMessagesSus});
                }
                //失败的话,将信息中的isSavedToServer改为false,同时将涉及到的信息的element的样式改变一下
                const sentFailCallback = function(data){
                    LocalDB.transaction_batch_update({"messagesToIDB":sentingMessagesFail});
                    alert(data);
                }     
                //将等待发送的信息发送到服务端
                Utility.askData(
                    {
                        "isAsync":true,
                        "method":"POST",
                        "address":messageDBPostaddress,
                        "params":stringifyMessages,
                        "susCallback":sentSusCallback,
                        "errorCallback":sentFailCallback,
                        "csrf":true,
                    }
                );  
            }
        );
    }
    static transaction_write(keywordParams={}){
        const messageToIDB = keywordParams["messageToIDB"]
        db.messages.add(messageToIDB).then (function(){
            // Then when data is stored, read from it
        }).catch(function(error) {
            // Finally don't forget to catch any error
            // that could have happened anywhere in the
            // code blocks above.
        });
    }
    static transaction_batch_write(keywordParams={}){
        const messagesToIDB = keywordParams["messagesToIDB"];
        db.messages.bulkAdd(messagesToIDB).then(function(lastKey) {
        }).catch(Dexie.BulkError, function (e) {
            // Explicitely catching the bulkAdd() operation makes those successful
            // additions commit despite that there were errors.
        });
    }
    static transaction_batch_update(keywordParams={}){
        const messagesToIDB = keywordParams["messagesToIDB"];
        db.messages.bulkPut(messagesToIDB).then(function(lastKey) {
        }).catch(Dexie.BulkError, function (e) {
            // Explicitely catching the bulkAdd() operation makes those successful
            // additions commit despite that there were errors.
        });
    }
    static clear(){
        db.messages
            .toCollection()
            .delete()
            .then(function (deleteCount) {

            });
    }
}

class HelperManager{
    constructor(){

    }
    static clickLinkTargetToHelpMoveUpTheInput(){
         window.setTimeout(Utility.scrollToBott,500);
    }
    static makeMeTextToHtml(obj,prepend=false){
        const data = Utility.makeTextToHtml(obj,"me");
        const meDiv = Utility.createElement(
            {
                "class":"me",
                "parent":data.container,
                "id":data.id,
                "prepend":prepend
            }
        );
        const meSpaceDiv = Utility.createElement(
            {
                "class":"meSpace",
                "parent":meDiv
            }
        );
        const textDiv = Utility.createElement(
            {
                "class":"text",
                "text":data.text,
                "parent":meDiv
            }
        );
        const dateSpan = Utility.createElement(
            {
                "tag":"span",
                "class":"date",
                "text":data.createdTime,
                "parent":textDiv
            }
        );
        const avatarDiv = Utility.createElement(
            {
                "class":"avatar",
                "parent":meDiv
            }
        );
        const img = Utility.createElement(
            {
                "tag":"img",
                "src":data.avatar,
                "parent":avatarDiv
            }
        );
        if(!prepend) Utility.scrollToBott();
        return data;
    }
    static makeHimTextToHtml(obj,prepend=false){
        const data = Utility.makeTextToHtml(obj,"him");
        const himDiv = Utility.createElement(
            {
                "class":"friend",
                "parent":data.container,
                "data":data.id,
                "prepend":prepend
            }
        );
        const avatarDiv = Utility.createElement(
            {
                "class":"avatar",
                "parent":himDiv
            }
        );
        const img = Utility.createElement(
            {
                "tag":"img",
                "src":data.avatar,
                "parent":avatarDiv
            }
        );
        const textDiv = Utility.createElement(
            {
                "class":"text",
                "text":data.text,
                "parent":himDiv
            }
        );
        const dateSpan = Utility.createElement(
            {
                "tag":"span",
                "class":"date",
                "text":data.createdTime,
                "parent":textDiv
            }
        );
        if(!prepend) Utility.scrollToBott();
        return true;
    }
}

class EventManager{
    constructor(){

    }
    static monitorWindowScrollToFindWhetherGotToTop(){
        let _startY;
        const contentContainer = document.querySelector('.contentContainer');
        contentContainer.addEventListener('touchstart', e => {
        _startY = e.touches[0].pageY;
        }, {passive: true});
        contentContainer.addEventListener('touchmove', e => {
            if(alreadyToTop){
                return;
            }
            const y = e.touches[0].pageY;
            // Activate custom pull-to-refresh effects when at the top of the container
            // and user is scrolling up.
            if (document.scrollingElement.scrollTop === 0 && y > _startY &&
                !document.body.classList.contains('refreshing')) {
                LocalDB.transaction_read().then(
                    function(messages){
                        if(!messages || messages.length < 1){
                            return;
                        }
                        messages.forEach(
                            function(message){
                                if(message.userId == meId){
                                    HelperManager.makeMeTextToHtml(message,true);
                                }else{
                                    HelperManager.makeHimTextToHtml(message,true);
                                }
                            }
                        );
                    }
                );
            }
        }, {passive: true});
    }
    static monitorScrollAndKeyUpAndPressButtonActionByUser(){
        document.querySelector("textarea")
            .addEventListener("scroll",EventManager.pushTheTextLengthWhenNewLineGenerated,false);

        document.querySelector("textarea")
                .addEventListener("keyup",EventManager.changeTextareaHeightWhenDeletingText,false);

        document.querySelector(".sendButton")
                .addEventListener("click",MainClass.secondStep_pressSendButtonAndSendTheMessage,false);

        document.querySelector("textarea")
                .addEventListener("click",HelperManager.clickLinkTargetToHelpMoveUpTheInput,false);

    }
    static pushTheTextLengthWhenNewLineGenerated(){
        if(countLine.length < 1 && document.querySelector("textarea").textLength > 10){
            countLine.push(document.querySelector("textarea").textLength);
        }
    }
    static changeTextareaHeightWhenDeletingText(){
        if(event.keyCode == 13){
            document.querySelector(".sendButton").click();
            document.querySelector("textarea").value = "";
            document.querySelector("textarea").style.height = "28px";
            return;
        }
        if(event.keyCode == 8){
            if(document.querySelector("textarea").offsetHeight > 48){
                if( (document.querySelector("textarea").style.height.slice(0,-2) > 28) && document.querySelector("textarea").textLength <= countLine[0] ){
                    document.querySelector("textarea").style.height = "28px";
                }
            }
        }else{
            if(document.querySelector("textarea").textLength > countLine[0] && document.querySelector("textarea").offsetHeight <= 56){
                document.querySelector("textarea").style.height = document.querySelector("textarea").scrollHeight+"px";
            }
        }
    }

}

class TimeoutManager{
    constructor(){

    }
    static beIdleTime(){
        if(idleTimeCount > 60 && idleTimeCount <= 90){ //超过6分钟低于等于9分钟则把每次请求的时间变成1分钟
            window.clearInterval(getNewMessageTimeoutId);
            TimeoutManager.setReadMessageTimeout(60);
        }else if(idleTimeCount > 90 && idleTimeCount <= 100){ //超过9分钟低于等于19分钟则把每次请求的时间变成10分钟
            window.clearInterval(getNewMessageTimeoutId);
            TimeoutManager.setReadMessageTimeout(60*10);
        }else if(idleTimeCount > 100 && idleTimeCount <= 102){ //超过19分钟低于等于39分钟则把每次请求的时间变成1小时
            window.clearInterval(getNewMessageTimeoutId);
            TimeoutManager.setReadMessageTimeout(60*60);
        }else if(idleTimeCount > 105){ //超过4小时39分钟后把时间调回
            window.clearInterval(getNewMessageTimeoutId);
            TimeoutManager.setReadMessageTimeout(10);
            idleTimeCount = 0;
        }else{
            null;
        }
    }
    static beActiveTime(){
        if(idleTimeCount > 60){
            window.clearInterval(getNewMessageTimeoutId);
            idleTimeCount = 0;
            TimeoutManager.setReadMessageTimeout(10);
        }
    }
    static setReadMessageTimeoutOnce(interval){
        window.setTimeout(MainClass.firstStep_getNewMessageFromServerAndInsertToIndexedDB,interval*1000)
    }
    static setReadMessageTimeout(interval){
        getNewMessageTimeoutId = window.setInterval(MainClass.firstStep_getNewMessageFromServerAndInsertToIndexedDB,interval*1000)
        return getNewMessageTimeoutId;
    }
    static setSendMessageTimeout(interval){
        sendMessageTimeoutID = window.setInterval(TimeoutManager.sendMessageToServerEach5Seconds, interval*1000);
        return sendMessageTimeoutID;
    }
    static clearShowTheCount(){
        if(clearShowTheCountSetTimeoutId) window.clearInterval(clearShowTheCountSetTimeoutId);
        if(document.querySelector(".showTheCountSpan")){
            document.querySelector(".showTheCountSpan").remove();
        }
    }
    static sendMessageToServerEach5Seconds(){
        const messagesPromise = LocalDB.if_have_unsent_messages().then(
            function(messages){
                if(!messages || messages.length < 1){
                    window.clearInterval(sendMessageTimeoutID);
                    setSendMessageTimeoutStart = false;
                    return [];
                }else{
                    return messages;
                }
            }
        );
        LocalDB.write_unsent_messages_local_to_server(messagesPromise);
    }
}

class Utility{
    constructor(){

    }
    static createElement(keywordParams){
        const tag = keywordParams["tag"] ? keywordParams["tag"] : "div";
        const element = document.createElement(tag);
        const prepend = keywordParams["prepend"] ? keywordParams["prepend"] : null;
        const parent = keywordParams["parent"] ? keywordParams["parent"] : null;
        keywordParams.class ? element.setAttribute("class", keywordParams.class) : null;
        keywordParams.src ? element.setAttribute("src", keywordParams.src) : null;
        keywordParams.style ? element.setAttribute("style", keywordParams.style) : null;
        keywordParams.type ? element.setAttribute("type", keywordParams.type) : null;
        keywordParams.href ? element.setAttribute("href", keywordParams.href) : null;
        keywordParams.placeholder ? element.setAttribute("placeholder", keywordParams.placeholder) : null;
        keywordParams.multiple ? element.setAttribute("multiple", keywordParams.multiple) : null;
        keywordParams.accept ? element.setAttribute("accept", keywordParams.accept) : null;
        keywordParams.title ? element.setAttribute("title", keywordParams.title) : null;
        keywordParams.data ? element.setAttribute("data", keywordParams.data) : null;
        keywordParams.id ? element.id = keywordParams.id : null;
        keywordParams.text ? element.innerText = keywordParams.text : null;
        keywordParams.value ? element.value = keywordParams.value : null;
        prepend ? parent.prepend(element) : parent.append(element);
        return element;
    }
    static askData(keywordParams){
        let data;
        const csrf = keywordParams["csrf"];
        const address = keywordParams["address"];
        const method = keywordParams["method"];
        const isAsync = keywordParams["isAsync"]
        const params = keywordParams["params"] ? keywordParams["params"] : null;
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) {
                try{
                    data = JSON.parse(xhr.responseText);
                }catch(e){
                    data = xhr.responseText;
                }
                if(keywordParams["susCallback"]){
                    keywordParams["susCallback"](data);
                }
            }
        }
        if(method == "GET"){
            xhr.open("GET", address, isAsync)
        }else{
            xhr.open("POST", address, isAsync);
            if(csrf){
                let csrf_token = document.querySelector('#csrf')
                                     .getAttribute("content");
                xhr.setRequestHeader('X-CSRFToken', csrf_token);             
            }
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            
            
        }
        params ? xhr.send(params) : xhr.send();
        return data;
    }
    static getTime(){
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const date = today.getDate();
        const hour = today.getHours();
        const minute = today.getMinutes() >= 10 ? today.getMinutes() : "0"+today.getMinutes();
        const second = today.getSeconds() >= 10 ? today.getSeconds() : "0"+today.getSeconds();
        return year + "-" + month + "-" + date + " " + hour + ":" + minute + ":" + second;
    }
    static scrollToBott(){
        window.scroll({
          top: 10000,
          left: 0,
          behavior: 'smooth'
        });
    }
    static makeTextToHtml(obj={},who){
        const avatar = document.querySelector("#chatWindow").getAttribute(who);
        const createdTime = obj.createdAt ? obj.createdAt : Utility.getTime();
        const messageContent = obj.message;
        return {
            "id":createdTime.replace(" ",""),
            "text":messageContent,
            "avatar":avatar,
            "createdTime":createdTime,
            "container":document.querySelector(".contentContainer")
        };
    }
    static animateSendButton(){
        const sendButton = document.querySelector(".sendButton");
        sendButton.style.padding = "0 4px";
        window.setTimeout(()=>sendButton.style.padding="0 8px",80);
    }
}