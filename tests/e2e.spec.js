
describe('End to End - Trade Flow', () => {
  it('login, add trade, see KPI update', () => {
    cy.visit('/')
    // Assumes you are already logged in via supabase cookie
    cy.contains('新增交易').click()
    cy.get('input[placeholder=代码]').type('AAPL')
    cy.get('input[placeholder=价格]').type('210.55')
    cy.get('input[placeholder=数量]').type('1.5')
    cy.contains('提交').click()
    cy.contains('关闭').click()
    cy.contains('AAPL')
  })
})
