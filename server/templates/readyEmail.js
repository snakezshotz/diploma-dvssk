function buildReadyEmailTemplate({ studentName, requestNumber, requestType }) {
  const subject = `Ваша заявка ${requestNumber} готова`;
  const body = [
    `Здравствуйте, ${studentName}!`,
    '',
    `Ваша заявка ${requestNumber} (${requestType}) готова.`,
    'Получить справку можно в учебной части, каб. 9.',
    '',
    'С уважением,',
    'Дальневосточный судостроительный колледж'
  ].join('\n');

  return { subject, body };
}

module.exports = {
  buildReadyEmailTemplate
};
