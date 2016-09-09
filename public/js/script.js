(function ($) {
    $(function () {
        // Auto Scroll page up to show revealed items to purchase
        $('html, body').animate({ scrollTop: 300 }, 800);

        document.querySelector('#p2').addEventListener('mdl-componentupgraded', function () {
            this.MaterialProgress.setBuffer(87);
        });

        var feedbackCodeForm = $('#feedback_code_form'),
            feedbackCodeField = $('#feedback_code'),
            feedbackCodeMinLength = 6,
            progressWindow = $('#p2'),
            step1Section = $('.step_1'),
            step2Section = $('.step_2'),
            dropDown = $('.dropdown'),
            backBtn = $('#btn_back');

        feedbackCodeForm.on('submit', function (event) {
            event.preventDefault();
            processForm();
        });

        backBtn.on('click', function (e) {
            switchFromSection(STEP_2);
            e.preventDefault();
        });

        var STEP_1 = "step_1",
            STEP_2 = "step_2",
            PROGRESS_BAR = "progress_bar";

        function switchFromSection(from) {
            switch (from) {
                case STEP_1:
                    step1Section.hide('slow', function () {
                        // Hide progress bar
                        progressWindow.hide('slow');
                        step2Section.show('slow', function () {
                            $(this).removeClass('hidden');
                            // Auto Scroll page up to show revealed items to purchase
                            $('html, body').animate({ scrollTop: 300 }, 800);
                        });
                    });
                    break;
                case STEP_2:
                    step2Section.hide('slow', function () {
                        step1Section.show('slow', function () {
                            $('html, body').animate({ scrollTop: 300 }, 800);
                        });
                    });
                    break;
            }
        };

        function toggleProgressBar(transitionFrom) {
            switch (transitionFrom) {
                case STEP_1:
                    step1Section.hide('slow', function () {
                        progressWindow.show('slow');
                    });
                    break;
                case STEP_2:
                    step2Section.hide('slow', function () {
                        progressWindow.show('slow');
                    });
                    break;
                case PROGRESS_BAR:
                    step1Section.show('slow', function () {
                        progressWindow.hide('slow');
                    })
                    break;
            }
        }// dropDown.dropdown();

        // TODO: Unit test this function with empty string for tel_field
        /**
         * Validate the phone number entered by user
         * @param event Submit event object.
         */
        function processForm() {
            var feedbackCode = feedbackCodeField.val().trim();
            if (feedbackCode == '') {
                notifyErrorMessage('Please enter the unique code for this feedback.');
            } else if (feedbackCode.length < feedbackCodeMinLength) {
                notifyErrorMessage('The unique feedback code can\'t be less than' + feedbackCodeMinLength + ' characters in length.')
            } else {
                clearErrorNotification();

                toggleProgressBar(STEP_1);

                $.ajax({
                    type: 'POST',
                    url: '/',
                    data: { 'feedback_code': feedbackCode },
                    /**
                     * {Object} dataReturned Data that's returned from the server
                     * {String} textStatus
                     * {jqXHR} jqXHR object
                     */
                    success: function (dataReturned, textStatus, jqXHR) {
                        parseReturnedData(dataReturned);
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        alert(errorThrown);
                    },
                    dataType: 'json'
                });
            }
        }

        // TODO: Test that this method really sets the UI as requested
        function notifyErrorMessage(error_msg) {
            feedbackCodeField.css('border', '1px solid red');
            feedbackCodeField.attr('title', error_msg)
            alert(error_msg);
        };

        // TODO: Test that this method really sets the UI as requested
        function clearErrorNotification() {
            feedbackCodeField.css('border', '');
            feedbackCodeField.attr('title', '');
        };

        var sessionId, question;

        /**
         * Parse data returned from phone number validation in the remote back-end.
         * @param {Object} dataReturned     Data that's returned from the server.
         */
        function parseReturnedData(dataReturned) {
            if (typeof dataReturned.errorMsg != 'undefined' && dataReturned.errorMsg != '') {
                notifyErrorMessage(dataReturned.errorMsg);
                return toggleProgressBar(PROGRESS_BAR);
            }

            var contactUsErrorMessage = 'Our admin have been notified to fix this issue; please try again soon.';

            if (typeof dataReturned.sessionId == 'undefined' || dataReturned.sessionId == '') {
                notifyErrorMessage('We couldn\'t ascertain the Session ID for this survey. ' + contactUsErrorMessage);
                clearErrorNotification();
                return toggleProgressBar(PROGRESS_BAR);
            }
            if (typeof dataReturned.question == 'undefined' || dataReturned.question == '') {
                notifyErrorMessage('This survey doesn\'t contain any question. ' + contactUsErrorMessage);
                clearErrorNotification();
                return toggleProgressBar(PROGRESS_BAR);
            }

            if (typeof dataReturned.questionType == 'undefined' && dataReturned.questionType == '') {
                notifyErrorMessage('We\'re having problems formatting the survey question. ' + contactUsErrorMessage);
                clearErrorNotification();
                return toggleProgressBar(PROGRESS_BAR);
            }

            sessionId = dataReturned.sessionId;
            question = dataReturned.question;

            // TODO: Inject a <div> containing an appropriately-formatted
            // question into the page:

            insertQuestionIntoPage(dataReturned.question, dataReturned.questionType, dataReturned.questionOptions || '', function () {
                clearErrorNotification();
                switchFromSection(STEP_1);
            });

        }

        // TODO: Test with empty question
        // TODO: Test the different question types
        function insertQuestionIntoPage(question, questionType, questionOptions, callback) {
            var questionField = $('#form_survey > p.label_instruction');
            questionField.text(question);

            $('#answer').remove();

            switch (parseInt(questionType)) {
                case 1: // 'Free text':
                    // insert a text area control below the questionField:
                    $('<textarea id="answer" name="answer" rows="3" autofocus required placeholder="Type-in your answer here"/>').insertAfter(questionField);
                    break;

                case 4: //'Single choice':
                    // insert a dropdown list control
                    $('<select class="ui dropdown" id="ddlAnswerOptions"></select>').insertAfter(questionField);

                    // Set the prompt text
                    $('#ddlAnswerOptions').append('<option value="">Select an option</option>');

                    // Dynamically populate the dropdown list with the available options
                    questionOptions.forEach(function (element) {
                        $('#ddlAnswerOptions').append('<option value="' + element + '">' + element + '</option>');
                    }, this);
                    break;
            }

            callback();
        }


        $('form#form_survey').on('submit', function (e) {
            e.preventDefault();
            alert('Implementation in progress');

            var dataToSubmit = {
                answer: $('#answer').val(),
            }

            // POST data to server and load a new question
            $.ajax({
                type: 'POST',
                url: $(this).attr('action'),
                data: dataToSubmit,

                // 3. and then forward the same data to the Interswitch URL:
                success: submitToInterswitch,
                dataType: 'json'
            });
        });


        // var formSubmitted;
        $('form.merchandise').on('submit', function (e) {
            e.preventDefault();

            toggleProgressBar(STEP_2);

            // formSubmitted = $(this);

            // 1. Get all the form's elements and their values:
            var formData = $(this).serializeArray();
            var formDataItems = {};
            $.each(formData,
                function (i, v) {
                    formDataItems[v.name] = v.value;
                }
            );

            var dataToSubmit = {
                /*paymentCode: formDataItems['paymentCode'],
                redirectUrl: formDataItems['redirectUrl'],*/
                amount: formDataItems['amount'],
                countryCode: $('#country_code').val(),
                mobileNumber: $('#tel_customer').val(),
                /*emailAddress: formDataItems['emailAddress'],*/
                requestReference: formDataItems['requestReference']
            }

            // 2. send the data to backend for persistence
            submitCustomerRegistration(dataToSubmit);
        });

        function submitCustomerRegistration(dataToSubmit) {
            $.ajax({
                type: 'POST',
                url: '/save',
                data: dataToSubmit,

                // 3. and then forward the same data to the Interswitch URL:
                success: submitToInterswitch,
                dataType: 'json'
            });
        }

        /**
         * On successfully submitting data to server, redirect and submit the same data to Interswitch.
         * @param {Object} data         Data that's returned from the server
         * @param {String} textStatus
         * @param {XMLHttpRequest} jqXHR
         */
        function submitToInterswitch(dataReturned, textStatus, jqXHR) {
            if (dataReturned.errorMsg != undefined && dataReturned.errorMsg.trim() != '') {
                notifyErrorMessage(dataReturned.errorMsg);
            } else {
                clearErrorNotification();
                /*formSubmitted.attr('action', '<%= baseUrl %>');
                formSubmitted.submit();*/

                var form = '';
                $.each(dataReturned, function (key, value) {
                    form += '<input type="hidden" name="' + key + '" value="' + value + '">';
                });
                $('<form action="' + dataReturned.gatewayUrl + '" method="POST">' + form + '</form>').appendTo('body').submit();
            }
        };

    });

})(jQuery)